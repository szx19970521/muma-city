import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("renderer bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("react-dom/client");
    vi.doUnmock("./components/ErrorBoundary");
    vi.doUnmock("./App");
    vi.doUnmock("./components/I18nProvider");
    vi.doUnmock("./utils/analytics");
    vi.resetModules();
  });

  it("mounts the React app into #root", async () => {
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));

    vi.doMock("react-dom/client", () => ({ createRoot }));
    vi.doMock("./components/ErrorBoundary", () => ({
      default: ({ children }: { children: React.ReactNode }) => children,
    }));
    vi.doMock("./App", () => ({ default: () => null }));
    vi.doMock("./components/I18nProvider", () => ({
      I18nProvider: ({ children }: { children: React.ReactNode }) => children,
    }));
    vi.doMock("./utils/analytics", () => ({ initAnalytics: vi.fn() }));

    const module = await import("./main");
    expect(screenStartup()).toHaveTextContent("牧马城市");
    await module.startupPromise;

    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("shows startup diagnostics if #root is missing", async () => {
    document.body.innerHTML = "";

    vi.doMock("./utils/analytics", () => ({ initAnalytics: vi.fn() }));

    const module = await import("./main");
    await module.startupPromise;

    expect(
      document.querySelector('[data-testid="startup-crash"]'),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Renderer root element #root");
  });

  it("shows startup diagnostics when a startup dependency fails", async () => {
    vi.doMock("./utils/analytics", () => ({
      initAnalytics: () => {
        throw new Error("simulated startup dependency failure");
      },
    }));

    const module = await import("./main");
    await module.startupPromise;

    expect(
      document.querySelector('[data-testid="startup-crash"]'),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "simulated startup dependency failure",
    );
  });
});

function screenStartup(): HTMLElement {
  const startup = document.querySelector<HTMLElement>(
    '[data-testid="pre-react-startup"]',
  );
  if (!startup) throw new Error("missing pre-react startup page");
  return startup;
}
