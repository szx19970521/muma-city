function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RendererLoadFailureDetails {
  target: string;
  reason: string;
  attempts: number;
  maxAttempts: number;
  mode: "dev" | "packaged";
}

export function buildRendererLoadFailureHtml(
  details: RendererLoadFailureDetails,
): string {
  const target = escapeHtml(details.target);
  const reason = escapeHtml(details.reason);
  const mode = escapeHtml(details.mode);
  const attempts = escapeHtml(`${details.attempts}/${details.maxAttempts}`);

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>牧马城市 - 启动诊断</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        background: #0f172a;
        color: #e2e8f0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(760px, 100%);
        padding: 28px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.94);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
      }
      .eyebrow {
        margin: 0 0 10px;
        color: #fbbf24;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.25;
      }
      p {
        margin: 12px 0 18px;
        color: #94a3b8;
        line-height: 1.55;
      }
      dl {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 10px 14px;
        margin: 0 0 20px;
      }
      dt {
        color: #94a3b8;
        font-weight: 700;
      }
      dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      button {
        border: 0;
        border-radius: 10px;
        padding: 10px 16px;
        background: #facc15;
        color: #111827;
        font-weight: 800;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main role="alert" data-testid="renderer-load-failure">
      <p class="eyebrow">Renderer load failure</p>
      <h1>牧马城市没有完成启动</h1>
      <p>窗口已经切换到诊断页，避免只显示白屏。请把下面的信息用于定位启动问题。</p>
      <dl>
        <dt>模式</dt><dd>${mode}</dd>
        <dt>目标</dt><dd>${target}</dd>
        <dt>原因</dt><dd>${reason}</dd>
        <dt>尝试次数</dt><dd>${attempts}</dd>
      </dl>
      <button type="button" onclick="location.reload()">重新加载</button>
    </main>
  </body>
</html>`;
}

export function rendererLoadFailureDataUrl(
  details: RendererLoadFailureDetails,
): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    buildRendererLoadFailureHtml(details),
  )}`;
}
