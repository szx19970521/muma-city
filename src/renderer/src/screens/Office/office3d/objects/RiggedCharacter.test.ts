import { describe, expect, it } from "vitest";
import {
  resolveRocketboxMaterialColor,
  resolveRiggedAnimationClipKey,
  shouldApplyDeskArmPose,
  softenRocketboxTint,
  stabilizeRocketboxAnimationClip,
} from "./RiggedCharacter";
import type { RenderAgent } from "../core/types";
import { createAgentAvatarProfileFromSeed } from "../avatars/profile";
import { DIVIDER_X } from "../layout";
import * as THREE from "three";

function agentState(
  state: RenderAgent["state"],
  walkSpeed = 1,
): Pick<RenderAgent, "state" | "walkSpeed"> {
  return { state, walkSpeed };
}

function poseAgent(
  state: RenderAgent["state"],
  x = DIVIDER_X - 1,
): Pick<RenderAgent, "state" | "x"> {
  return { state, x };
}

describe("rigged agent animation state", () => {
  it("maps office behavior states to Rocketbox office animation keys", () => {
    expect(resolveRiggedAnimationClipKey(agentState("walking"))).toBe("walk");
    expect(resolveRiggedAnimationClipKey(agentState("standing"))).toBe("idle");
    expect(resolveRiggedAnimationClipKey(agentState("idle_patrol"))).toBe(
      "idle",
    );
    expect(resolveRiggedAnimationClipKey(agentState("away"))).toBe("idle");
    expect(resolveRiggedAnimationClipKey(agentState("sitting"))).toBe(
      "sit_chair",
    );
    expect(resolveRiggedAnimationClipKey(agentState("working_at_desk"))).toBe(
      "sit_chair",
    );
    expect(resolveRiggedAnimationClipKey(agentState("using_memory"))).toBe(
      "work_table",
    );
    expect(resolveRiggedAnimationClipKey(agentState("using_comms"))).toBe(
      "work_table",
    );
    expect(resolveRiggedAnimationClipKey(agentState("using_tools"))).toBe(
      "work_table",
    );
    expect(resolveRiggedAnimationClipKey(agentState("talking_to_player"))).toBe(
      "gestic_talk",
    );
    expect(resolveRiggedAnimationClipKey(agentState("opening_door"))).toBe(
      "try_door",
    );
    expect(resolveRiggedAnimationClipKey(agentState("working_out"))).toBe(
      "idle",
    );
    expect(resolveRiggedAnimationClipKey(agentState("dancing"))).toBe("idle");
  });

  it("identifies workstation poses that need a real desk animation", () => {
    expect(shouldApplyDeskArmPose(poseAgent("working_at_desk"))).toBe(true);
    expect(shouldApplyDeskArmPose(poseAgent("sitting", DIVIDER_X - 1))).toBe(
      true,
    );
    expect(shouldApplyDeskArmPose(poseAgent("sitting", DIVIDER_X + 1))).toBe(
      false,
    );
    expect(shouldApplyDeskArmPose(poseAgent("talking_to_player"))).toBe(false);
    expect(shouldApplyDeskArmPose(poseAgent("standing"))).toBe(false);
  });

  it("does not treat Rocketbox opacity folder names as black body material", () => {
    const bodyColor = resolveRocketboxMaterialColor(
      "D:/temp/Humans/with_opacity_version/f022",
      "f022_body",
      "#2f80ed",
    );
    const headColor = resolveRocketboxMaterialColor(
      "D:/temp/Humans/with_opacity_version/f022",
      "f022_head",
      "#2f80ed",
    );
    const opacityColor = resolveRocketboxMaterialColor(
      "Female_Party_02",
      "f022_opacity",
      "#2f80ed",
    );

    expect(bodyColor.getHexString()).toBe(
      softenRocketboxTint("#2f80ed").getHexString(),
    );
    expect(bodyColor.getHexString()).not.toBe("2f80ed");
    expect(headColor.getHexString()).toBe("c78662");
    expect(opacityColor.getHexString()).toBe("33251f");
  });

  it("uses the agent avatar profile to vary Rocketbox skin, hair, and clothes", () => {
    const appearance = createAgentAvatarProfileFromSeed("scene-agent-planner");
    const headColor = resolveRocketboxMaterialColor(
      "Female_Party_02",
      "f022_head",
      "#2f80ed",
      appearance,
    );
    const hairColor = resolveRocketboxMaterialColor(
      "Female_Party_02",
      "f022_opacity",
      "#2f80ed",
      appearance,
    );
    const bodyColor = resolveRocketboxMaterialColor(
      "Female_Party_02",
      "f022_body",
      "#2f80ed",
      appearance,
    );

    expect(headColor.getHexString()).toBe(
      new THREE.Color(appearance.body.skinTone).getHexString(),
    );
    expect(hairColor.getHexString()).toBe(
      new THREE.Color(appearance.hair.color).getHexString(),
    );
    expect(bodyColor.getHexString()).toBe(
      softenRocketboxTint(
        appearance.clothing.topColor,
      ).getHexString(),
    );
  });

  it("removes horizontal Rocketbox walk root motion", () => {
    const clip = new THREE.AnimationClip("walk", 1, [
      new THREE.VectorKeyframeTrack(
        "mixamorigHips.position",
        [0, 0.5, 1],
        [0, 1, 0, 2, 1.1, 3, 4, 1, 6],
      ),
      new THREE.QuaternionKeyframeTrack(
        "mixamorigHips.quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, 0, 0, 1],
      ),
    ]);

    const stable = stabilizeRocketboxAnimationClip("walk", clip);
    const positionTrack = stable.tracks.find((track) =>
      track.name.endsWith(".position"),
    ) as THREE.VectorKeyframeTrack;

    const values = Array.from(positionTrack.values);
    expect(values[0]).toBeCloseTo(0);
    expect(values[1]).toBeCloseTo(1);
    expect(values[2]).toBeCloseTo(0);
    expect(values[3]).toBeCloseTo(0);
    expect(values[4]).toBeCloseTo(1.1);
    expect(values[5]).toBeCloseTo(0);
    expect(values[6]).toBeCloseTo(0);
    expect(values[7]).toBeCloseTo(1);
    expect(values[8]).toBeCloseTo(0);
    expect(stable.tracks.some((track) => track.name.endsWith(".quaternion"))).toBe(
      true,
    );
  });
});
