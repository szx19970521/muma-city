export function startupErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function ensureRootElement(): HTMLElement {
  const existing = document.getElementById("root");
  if (existing) return existing;

  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
  return root;
}

export function renderStartupCrash(error: unknown, phase = "startup"): void {
  const root = ensureRootElement();
  const message = startupErrorMessage(error);

  root.innerHTML = "";
  root.style.minHeight = "100vh";
  root.style.background = "#0f172a";
  root.style.color = "#e2e8f0";
  root.style.fontFamily =
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const wrapper = document.createElement("main");
  wrapper.setAttribute("role", "alert");
  wrapper.setAttribute("data-testid", "startup-crash");
  wrapper.style.boxSizing = "border-box";
  wrapper.style.minHeight = "100vh";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.padding = "32px";

  const card = document.createElement("section");
  card.style.width = "min(720px, 100%)";
  card.style.border = "1px solid rgba(148, 163, 184, 0.28)";
  card.style.borderRadius = "16px";
  card.style.background = "rgba(15, 23, 42, 0.92)";
  card.style.boxShadow = "0 24px 80px rgba(0, 0, 0, 0.38)";
  card.style.padding = "28px";

  const eyebrow = document.createElement("p");
  eyebrow.textContent = `Renderer ${phase} failure`;
  eyebrow.style.margin = "0 0 10px";
  eyebrow.style.color = "#fbbf24";
  eyebrow.style.fontSize = "12px";
  eyebrow.style.fontWeight = "700";
  eyebrow.style.letterSpacing = "0.08em";
  eyebrow.style.textTransform = "uppercase";

  const title = document.createElement("h1");
  title.textContent = "The app could not finish loading";
  title.style.margin = "0";
  title.style.fontSize = "24px";
  title.style.lineHeight = "1.25";

  const copy = document.createElement("p");
  copy.textContent =
    "This diagnostic screen replaces a blank window so the startup error can be fixed instead of guessed.";
  copy.style.margin = "12px 0 18px";
  copy.style.color = "#94a3b8";
  copy.style.lineHeight = "1.5";

  const pre = document.createElement("pre");
  pre.textContent = message || "Unknown renderer startup error";
  pre.style.maxHeight = "260px";
  pre.style.overflow = "auto";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-word";
  pre.style.margin = "0 0 18px";
  pre.style.padding = "14px";
  pre.style.borderRadius = "10px";
  pre.style.background = "rgba(2, 6, 23, 0.86)";
  pre.style.color = "#cbd5e1";
  pre.style.fontSize = "12px";
  pre.style.lineHeight = "1.45";

  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.style.border = "0";
  reload.style.borderRadius = "10px";
  reload.style.padding = "10px 16px";
  reload.style.background = "#facc15";
  reload.style.color = "#111827";
  reload.style.fontWeight = "700";
  reload.style.cursor = "pointer";
  reload.addEventListener("click", () => window.location.reload());

  card.append(eyebrow, title, copy, pre, reload);
  wrapper.append(card);
  root.append(wrapper);
}

export function installStartupCrashHandlers(): () => void {
  const onError = (event: ErrorEvent): void => {
    renderStartupCrash(event.error ?? event.message, "window");
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    renderStartupCrash(event.reason, "promise");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
