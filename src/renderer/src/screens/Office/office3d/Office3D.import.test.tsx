import { describe, expect, it } from "vitest";

describe("Office3D import smoke", () => {
  it("imports the 3D office module without throwing during renderer startup", async () => {
    await expect(import("./Office3D")).resolves.toHaveProperty("default");
  });
});
