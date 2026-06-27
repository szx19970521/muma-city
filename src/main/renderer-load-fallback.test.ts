import { describe, expect, it } from "vitest";
import {
  buildRendererLoadFailureHtml,
  rendererLoadFailureDataUrl,
} from "./renderer-load-fallback";

describe("renderer load failure fallback", () => {
  it("renders a diagnostic page with escaped details", () => {
    const html = buildRendererLoadFailureHtml({
      target: 'http://localhost:5173/?x="<bad>"',
      reason: "ERR_CONNECTION_TIMED_OUT <script>alert(1)</script>",
      attempts: 24,
      maxAttempts: 24,
      mode: "dev",
    });

    expect(html).toContain("renderer-load-failure");
    expect(html).toContain("24/24");
    expect(html).toContain("ERR_CONNECTION_TIMED_OUT");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&lt;bad&gt;&quot;");
  });

  it("returns a data URL Electron can load without external files", () => {
    const url = rendererLoadFailureDataUrl({
      target: "C:/app/out/renderer/index.html",
      reason: "file not found",
      attempts: 1,
      maxAttempts: 24,
      mode: "packaged",
    });

    expect(url).toMatch(/^data:text\/html;charset=utf-8,/);
    expect(decodeURIComponent(url)).toContain("牧马城市没有完成启动");
  });
});
