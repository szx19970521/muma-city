import { useState, useEffect, useCallback } from "react";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./components/ThemeProvider";
import { FontProvider } from "./components/FontProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Welcome from "./screens/Welcome/Welcome";
import Install from "./screens/Install/Install";
import Setup from "./screens/Setup/Setup";
import Layout from "./screens/Layout/Layout";
import SplashScreen from "./screens/SplashScreen/SplashScreen";
import { captureScreenView } from "./utils/analytics";

type Screen = "splash" | "welcome" | "installing" | "setup" | "main";

// Minimum time the splash stays visible so the background video plays
// through. Gateway / config checks happen during this window.
const SPLASH_MIN_MS = 3000;
const STARTUP_IPC_TIMEOUT_MS = 8000;
const appModuleLoadedAt = performance.now();

function logAppStartup(stage: string, details?: unknown): void {
  const elapsedMs = Math.round(performance.now() - appModuleLoadedAt);
  if (details === undefined) {
    console.info(`[STARTUP app +${elapsedMs}ms] ${stage}`);
    return;
  }
  console.info(`[STARTUP app +${elapsedMs}ms] ${stage}`, details);
}

logAppStartup("module-loaded");

export function withStartupTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = STARTUP_IPC_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      logAppStartup("ipc-timeout", { label, timeoutMs });
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("splash");
  const [installError, setInstallError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<
    "local" | "remote" | "ssh"
  >("local");
  // Soft warning: install files exist but the deep `verifyInstall` probe
  // failed (e.g. slow Python startup, restricted network). We surface this
  // as a dismissible banner instead of bouncing the user back to Welcome,
  // which previously trapped restricted-network users in a reinstall
  // loop on every launch (#130).
  const [verifyWarning, setVerifyWarning] = useState(false);
  const [splashStatus, setSplashStatus] = useState<string | undefined>(
    undefined,
  );
  const isMac = window.electron?.process?.platform === "darwin";

  const runInstallCheck = useCallback(async () => {
    const startedAt = Date.now();
    let next: Screen = "welcome";
    let error: string | null = null;
    let isRemote = false;
    logAppStartup("install-check:start");

    try {
      setSplashStatus("Checking connection…");
      logAppStartup("install-check:get-connection-config:start");
      const conn = await withStartupTimeout(
        window.hermesAPI.getConnectionConfig(),
        "getConnectionConfig",
      );
      logAppStartup("install-check:get-connection-config:complete", {
        mode: conn.mode,
      });
      isRemote = conn.mode === "remote" || conn.mode === "ssh";
      setConnectionMode(conn.mode);

      if (conn.mode === "ssh" && conn.ssh) {
        setSplashStatus("Starting SSH tunnel…");
        logAppStartup("install-check:ssh-tunnel:start");
        try {
          await withStartupTimeout(
            window.hermesAPI.startSshTunnel(),
            "startSshTunnel",
          );
          logAppStartup("install-check:ssh-tunnel:complete");
          next = "main";
        } catch (tunnelErr) {
          logAppStartup("install-check:ssh-tunnel:failed", tunnelErr);
          error = `SSH tunnel failed to start: ${(tunnelErr as Error).message}`;
          next = "welcome";
        }
      } else if (conn.mode === "remote" && conn.remoteUrl) {
        setSplashStatus("Testing remote connection…");
        logAppStartup("install-check:remote-test:start", {
          remoteUrl: conn.remoteUrl,
        });
        const ok = await withStartupTimeout(
          window.hermesAPI.testRemoteConnection(conn.remoteUrl),
          "testRemoteConnection",
        );
        logAppStartup("install-check:remote-test:complete", { ok });
        if (ok) {
          next = "main";
        } else {
          error = `Cannot reach remote Hermes at ${conn.remoteUrl}. Check the URL or switch to local mode.`;
          next = "welcome";
        }
      } else {
        setSplashStatus("Checking local install…");
        logAppStartup("install-check:local-install:start");
        const status = await withStartupTimeout(
          window.hermesAPI.checkInstall(),
          "checkInstall",
        );
        logAppStartup("install-check:local-install:complete", {
          installed: status.installed,
          hasApiKey: status.hasApiKey,
        });
        if (!status.installed) {
          next = "welcome";
        } else if (!status.hasApiKey) {
          next = "setup";
        } else {
          next = "main";
        }

        // Warm config-health and gateway status in the background while the
        // splash is still visible so the first render is snappy. Cap at 800ms
        // so it never pushes us past the 3s minimum.
        if (next === "main") {
          setSplashStatus("Checking configuration…");
          logAppStartup("install-check:background-warm:start");
          await Promise.race([
            Promise.all([
              window.hermesAPI
                .getConfigHealth()
                .catch(() => null)
                .then(() => undefined),
              window.hermesAPI
                .gatewayStatus()
                .catch(() => null)
                .then(() => undefined),
            ]),
            new Promise<void>((r) => setTimeout(r, 800)),
          ]);
          logAppStartup("install-check:background-warm:complete");
        }
      }
    } catch (startupErr) {
      logAppStartup("install-check:failed", startupErr);
      error = `Startup check failed: ${(startupErr as Error).message}`;
      next = "welcome";
    }

    setSplashStatus(undefined);
    if (error) setInstallError(error);

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    logAppStartup("install-check:screen-decided", {
      next,
      elapsedMs: elapsed,
      splashWaitMs: wait,
      hasError: Boolean(error),
    });
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    setScreen(next);
    logAppStartup("install-check:screen-set", { next });

    // Lazy deep-verify in the background after the UI is up. If the
    // install is broken, surface the warning then — don't block startup.
    //
    // Skip for remote-mode connections: verifyInstall() probes the LOCAL
    // Python + script paths (HERMES_PYTHON / HERMES_SCRIPT in installer.ts),
    // which don't exist on machines that only use a remote backend. Without
    // this guard the user is bounced back to Welcome with an "installBroken"
    // error immediately after a successful remote connect. (#47, #41, #30)
    if ((next === "main" || next === "setup") && !isRemote) {
      logAppStartup("install-check:verify-install:background-start");
      window.hermesAPI
        .verifyInstall()
        .then((ok) => {
          logAppStartup("install-check:verify-install:background-complete", {
            ok,
          });
          // Files exist (checkInstall passed) but the probe failed. Surface
          // a soft warning instead of bouncing to Welcome — see #130.
          if (!ok) setVerifyWarning(true);
        })
        .catch((verifyErr) => {
          logAppStartup("install-check:verify-install:background-failed", verifyErr);
        });
    }
  }, []);

  useEffect(() => {
    runInstallCheck();
  }, [runInstallCheck]);

  // Track screen views for analytics
  useEffect(() => {
    captureScreenView(screen);
  }, [screen]);

  const handleSplashFinished = useCallback(() => {
    /* splash transition is driven by the install check, not a timer */
  }, []);

  function handleInstallComplete(): void {
    setInstallError(null);
    setScreen("setup");
  }

  function handleInstallFailed(error: string): void {
    setInstallError(error);
    setScreen("welcome");
  }

  function handleRetryInstall(): void {
    setInstallError(null);
    setScreen("installing");
  }

  function handleRecheck(): void {
    setInstallError(null);
    setScreen("splash");
    runInstallCheck();
  }

  async function handleSwitchToLocal(): Promise<void> {
    await window.hermesAPI.setConnectionConfig("local", "", "");
    setConnectionMode("local");
    handleRecheck();
  }

  function handleVerifyReinstall(): void {
    setVerifyWarning(false);
    setInstallError(null);
    setScreen("installing");
  }

  function handleDismissVerifyWarning(): void {
    setVerifyWarning(false);
  }

  function renderScreen(): React.JSX.Element {
    switch (screen) {
      case "splash":
        return (
          <SplashScreen
            onFinished={handleSplashFinished}
            status={splashStatus}
          />
        );
      case "welcome":
        return (
          <Welcome
            error={installError}
            connectionMode={connectionMode}
            onStart={handleRetryInstall}
            onRecheck={handleRecheck}
            onSwitchToLocal={handleSwitchToLocal}
          />
        );
      case "installing":
        return (
          <Install
            onComplete={handleInstallComplete}
            onFailed={handleInstallFailed}
            onCancel={() => setScreen("welcome")}
          />
        );
      case "setup":
        return (
          <Setup
            onComplete={() => setScreen("main")}
            verifyWarning={verifyWarning}
            onReinstall={handleVerifyReinstall}
            onDismissVerifyWarning={handleDismissVerifyWarning}
          />
        );
      case "main":
        return (
          <Layout
            verifyWarning={verifyWarning}
            onReinstall={handleVerifyReinstall}
            onDismissVerifyWarning={handleDismissVerifyWarning}
          />
        );
    }
  }

  return (
    <ThemeProvider>
      <FontProvider>
        <ErrorBoundary>
          <div className={`app${isMac ? " is-mac" : ""}`}>
            {isMac && <div className="drag-region" />}
            <div className="app-content">{renderScreen()}</div>
          </div>
          <Toaster
            position="bottom-right"
            reverseOrder={false}
            toastOptions={{
              style: {
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-bright)",
                fontSize: 13,
              },
            }}
          />
        </ErrorBoundary>
      </FontProvider>
    </ThemeProvider>
  );
}

export default App;
