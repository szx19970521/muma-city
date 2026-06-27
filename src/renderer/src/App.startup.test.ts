import { afterEach, describe, expect, it, vi } from "vitest";
import { withStartupTimeout } from "./App";

describe("startup timeout guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when startup IPC returns before the timeout", async () => {
    await expect(
      withStartupTimeout(Promise.resolve("ready"), "check", 100),
    ).resolves.toBe("ready");
  });

  it("rejects when startup IPC hangs", async () => {
    vi.useFakeTimers();
    const pending = withStartupTimeout(
      new Promise<never>(() => {}),
      "check",
      100,
    );

    vi.advanceTimersByTime(100);

    await expect(pending).rejects.toThrow("check timed out after 100ms");
  });
});
