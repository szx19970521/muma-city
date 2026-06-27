import { describe, expect, it } from "vitest";
import type { RenderAgent } from "../core/types";
import type { FirstPersonPlayerPose } from "./types";
import {
  PLAYER_FOOT_Y_OFFSET,
  playerThirdPersonPosition,
  resolvePlayerThirdPersonAnimationOverride,
  syncPlayerThirdPersonAgent,
} from "./PlayerThirdPersonCharacter";

function playerPose(
  patch: Partial<FirstPersonPlayerPose> = {},
): FirstPersonPlayerPose {
  return {
    position: [1, 0, 2],
    yaw: 0.25,
    pitch: 0,
    moving: false,
    sprinting: false,
    jumping: false,
    verticalOffset: 0,
    viewMode: "thirdPerson",
    ...patch,
  };
}

function renderAgent(): RenderAgent {
  return {
    id: "player-test",
    name: "player",
    status: "idle",
    color: "#fff",
    item: "player",
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    path: [],
    facing: 0,
    frame: 0,
    walkSpeed: 0,
    phaseOffset: 0,
    state: "standing",
  };
}

describe("third-person player character pose", () => {
  it("keeps the visible character anchored to the player ground position", () => {
    expect(playerThirdPersonPosition(playerPose({ position: [3, 0, -4] }))).toEqual([
      3,
      PLAYER_FOOT_Y_OFFSET,
      -4,
    ]);
    expect(
      playerThirdPersonPosition(
        playerPose({ position: [3, 0, -4], verticalOffset: 0.5 }),
      ),
    ).toEqual([3, 0.5 + PLAYER_FOOT_Y_OFFSET, -4]);
  });

  it("keeps the third-person foot clearance minimal and asset-derived", () => {
    expect(PLAYER_FOOT_Y_OFFSET).toBeGreaterThanOrEqual(0.005);
    expect(PLAYER_FOOT_Y_OFFSET).toBeLessThanOrEqual(0.008);
    expect(playerThirdPersonPosition(playerPose())[1]).toBe(PLAYER_FOOT_Y_OFFSET);
  });

  it("drives walking and sprinting animation state from player motion", () => {
    const agent = renderAgent();

    syncPlayerThirdPersonAgent(
      agent,
      playerPose({ moving: true, sprinting: true, yaw: 0.5 }),
      1 / 20,
    );

    expect(agent.state).toBe("walking");
    expect(agent.walkSpeed).toBeGreaterThan(2.5);
    expect(agent.facing).toBeCloseTo(0.5 + Math.PI);
    expect(agent.frame).toBeGreaterThan(2);
  });

  it("maps third-person player locomotion to explicit Quaternius clips", () => {
    expect(resolvePlayerThirdPersonAnimationOverride(playerPose())).toBe(
      "Idle_Loop",
    );
    expect(
      resolvePlayerThirdPersonAnimationOverride(playerPose({ moving: true })),
    ).toBe("Walk_Loop");
    expect(
      resolvePlayerThirdPersonAnimationOverride(
        playerPose({ moving: true, sprinting: true }),
      ),
    ).toBe("Sprint_Loop");
  });

  it("does not request leg animation while the player is standing", () => {
    const agent = renderAgent();

    syncPlayerThirdPersonAgent(agent, playerPose(), 1 / 30);

    expect(agent.state).toBe("standing");
    expect(agent.walkSpeed).toBe(0);
  });
});
