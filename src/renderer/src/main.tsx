import "./assets/main.css";

import {
  installStartupCrashHandlers,
  renderStartupCrash,
} from "./bootstrapCrash";

const rendererStartupStartedAt = performance.now();

function logRendererStartup(stage: string, details?: unknown): void {
  const elapsedMs = Math.round(performance.now() - rendererStartupStartedAt);
  if (details === undefined) {
    console.info(`[STARTUP renderer +${elapsedMs}ms] ${stage}`);
    return;
  }
  console.info(`[STARTUP renderer +${elapsedMs}ms] ${stage}`, details);
}

function renderPreReactStartup(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) throw new Error("Renderer root element #root was not found");

  root.innerHTML = `
    <main class="renderer-startup-page" role="status" aria-live="polite" data-testid="pre-react-startup">
      <section class="renderer-startup-brand" aria-label="牧马城市启动中">
        <span class="renderer-startup-mark">牧马</span>
        <h1>牧马城市</h1>
        <p>正在启动城市工作台</p>
      </section>
      <div class="renderer-startup-progress" aria-hidden="true">
        <span></span>
      </div>
    </main>
  `;

  logRendererStartup("pre-react-startup-rendered");
  return root;
}

async function startRenderer(): Promise<void> {
  installStartupCrashHandlers();

  try {
    const root = renderPreReactStartup();
    logRendererStartup("module-load:start");

    const [
      { StrictMode },
      { createRoot },
      { default: App },
      { default: ErrorBoundary },
      { I18nProvider },
      { initAnalytics },
    ] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("./App"),
      import("./components/ErrorBoundary"),
      import("./components/I18nProvider"),
      import("./utils/analytics"),
    ]);

    logRendererStartup("module-load:complete");

    // Initialize analytics (privacy-first, only if user consented and key is configured)
    initAnalytics();
    logRendererStartup("analytics:initialized");

    createRoot(root).render(
      <StrictMode>
        <ErrorBoundary>
          <I18nProvider>
            <App />
          </I18nProvider>
        </ErrorBoundary>
      </StrictMode>,
    );
    logRendererStartup("react-render:scheduled");
  } catch (error) {
    console.error("[RENDERER STARTUP]", error);
    logRendererStartup("diagnostic:render", error);
    renderStartupCrash(error, "bootstrap");
  }
}

export const startupPromise = startRenderer();
