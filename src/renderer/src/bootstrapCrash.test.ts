import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  installStartupCrashHandlers,
  renderStartupCrash,
  startupErrorMessage,
} from "./bootstrapCrash";

describe("renderer startup crash fallback", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("formats unknown startup errors safely", () => {
    expect(startupErrorMessage(new Error("boom"))).toContain("boom");
    expect(startupErrorMessage("plain failure")).toBe("plain failure");
    expect(startupErrorMessage({ code: "BAD_BOOT" })).toContain("BAD_BOOT");
  });

  it("renders a diagnostic page instead of leaving root blank", () => {
    renderStartupCrash(new Error("missing renderer chunk"), "bootstrap");

    expect(screenRoot()).toHaveTextContent("The app could not finish loading");
    expect(screenRoot()).toHaveTextContent("missing renderer chunk");
    expect(
      document.querySelector('[data-testid="startup-crash"]'),
    ).toBeInTheDocument();
  });

  it("creates root if index.html is malformed", () => {
    document.body.innerHTML = "";

    renderStartupCrash("no root", "bootstrap");

    expect(document.getElementById("root")).toBeInTheDocument();
    expect(screenRoot()).toHaveTextContent("no root");
  });

  it("installs and removes global crash handlers", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");

    const cleanup = installStartupCrashHandlers();
    cleanup();

    expect(add).toHaveBeenCalledWith("error", expect.any(Function));
    expect(add).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    expect(remove).toHaveBeenCalledWith("error", expect.any(Function));
    expect(remove).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
  });
});

function screenRoot(): HTMLElement {
  const root = document.getElementById("root");
  if (!root) throw new Error("missing root");
  return root;
}
