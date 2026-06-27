import { describe, expect, it } from "vitest";
import { FIRST_PERSON_RIG_CONFIG } from "./rigConfig";

describe("first-person rig config", () => {
  it("uses the isolated Kuptchi FBX POC instead of retired arm assets", () => {
    expect(FIRST_PERSON_RIG_CONFIG.assetFormat).toBe("fbx");
    expect(FIRST_PERSON_RIG_CONFIG.generatedOfficeActions).toBe(false);
    expect(FIRST_PERSON_RIG_CONFIG.attribution.author).toBe("Kuptchi");
    expect(FIRST_PERSON_RIG_CONFIG.visualReviewStatus).toBe("failed");
    expect(FIRST_PERSON_RIG_CONFIG.fallbackMode).toBe("safe-placeholder-hands");
    expect(FIRST_PERSON_RIG_CONFIG.activeRigUrl.toLowerCase()).toContain(
      "kuptchi",
    );

    const activeUrl = FIRST_PERSON_RIG_CONFIG.activeRigUrl.toLowerCase();
    expect(activeUrl).not.toContain("first_person_hands.glb");
    expect(activeUrl).not.toContain("opengameart");
    expect(activeUrl).not.toContain("j-toastie");
    expect(activeUrl).not.toContain("rigged-fps-arms");
  });

  it("maps every first-person gameplay action to bundled asset clips", () => {
    const sourceActions = new Set(
      FIRST_PERSON_RIG_CONFIG.animationSources?.map((source) => source.action),
    );
    expect(sourceActions).toEqual(
      new Set([
        "idle",
        "walk",
        "jump",
        "click",
        "reach_mid",
        "reach_high",
        "pickup_floor",
        "grab_shelf",
        "hold_one_hand",
        "hold_two_hand",
        "put_away",
        "inspect",
      ]),
    );
  });
});
