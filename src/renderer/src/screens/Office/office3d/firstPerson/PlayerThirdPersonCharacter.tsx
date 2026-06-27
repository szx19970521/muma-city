import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RenderAgent } from "../core/types";
import {
  QUATERNIUS_ANIMATION_LIBRARY_URL,
  RiggedCharacter,
} from "../objects/RiggedCharacter";
import type { FirstPersonPlayerPose } from "./types";

const PLAYER_AGENT_ID = "__player_avatar_preview__";
const PLAYER_SCALE_MULTIPLIER = 2.62;
// Derived from local GLB bbox sampling:
// static minY ~= 0.00046, Walk_Loop minY ~= -0.00474 before RiggedCharacter's
// static bbox floor alignment. Keep this as a millimetre-scale clearance, not
// a visual hand-tuned lift.
export const PLAYER_FOOT_Y_OFFSET = 0.006;
const PLAYER_IDLE_CLIP = "Idle_Loop";
const PLAYER_WALK_CLIP = "Walk_Loop";
const PLAYER_RUN_CLIP = "Sprint_Loop";

function createPlayerAgent(): RenderAgent {
  return {
    id: PLAYER_AGENT_ID,
    name: "玩家",
    status: "idle",
    color: "#7a6b9f",
    item: "player",
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    path: [],
    facing: Math.PI,
    frame: 0,
    walkSpeed: 0,
    phaseOffset: 0,
    state: "standing",
  };
}

export function playerThirdPersonPosition(
  pose: FirstPersonPlayerPose,
): [number, number, number] {
  return [
    pose.position[0],
    pose.position[1] + pose.verticalOffset + PLAYER_FOOT_Y_OFFSET,
    pose.position[2],
  ];
}

export function syncPlayerThirdPersonAgent(
  agent: RenderAgent,
  pose: FirstPersonPlayerPose,
  delta: number,
): void {
  agent.x = pose.position[0];
  agent.y = pose.position[2];
  agent.targetX = pose.position[0];
  agent.targetY = pose.position[2];
  agent.facing = pose.yaw + Math.PI;
  agent.walkSpeed = pose.moving ? (pose.sprinting ? 3.15 : 1.55) : 0;
  agent.frame +=
    Math.min(delta, 1 / 30) * 60 * (pose.moving && pose.sprinting ? 1.35 : 1);
  agent.state = pose.moving ? "walking" : "standing";
}

export function resolvePlayerThirdPersonAnimationOverride(
  pose: Pick<FirstPersonPlayerPose, "moving" | "sprinting">,
): string {
  if (!pose.moving) return PLAYER_IDLE_CLIP;
  return pose.sprinting ? PLAYER_RUN_CLIP : PLAYER_WALK_CLIP;
}

export function PlayerThirdPersonCharacter({
  poseRef,
}: {
  poseRef: MutableRefObject<FirstPersonPlayerPose>;
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const agentsRef = useRef<RenderAgent[]>([createPlayerAgent()]);
  const agentLookupRef = useRef<Map<string, RenderAgent>>(new Map());
  const animationOverrideRef = useRef<string>(PLAYER_IDLE_CLIP);
  const [animationOverride, setAnimationOverride] =
    useState<string>(PLAYER_IDLE_CLIP);

  if (!agentLookupRef.current.has(PLAYER_AGENT_ID)) {
    agentLookupRef.current.set(PLAYER_AGENT_ID, agentsRef.current[0]);
  }

  useFrame((_, delta) => {
    const group = groupRef.current;
    const agent = agentsRef.current[0];
    const pose = poseRef.current;
    const visible = pose.viewMode === "thirdPerson";

    if (group) {
      group.visible = visible;
      group.position.set(...playerThirdPersonPosition(pose));
      // Quaternius faces +Z in this scene; player yaw 0 looks toward -Z.
      group.rotation.y = pose.yaw + Math.PI;
    }

    syncPlayerThirdPersonAgent(agent, pose, delta);
    const nextAnimationOverride = resolvePlayerThirdPersonAnimationOverride(pose);
    if (animationOverrideRef.current !== nextAnimationOverride) {
      animationOverrideRef.current = nextAnimationOverride;
      setAnimationOverride(nextAnimationOverride);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <RiggedCharacter
        url={QUATERNIUS_ANIMATION_LIBRARY_URL}
        agentId={PLAYER_AGENT_ID}
        agentsRef={agentsRef}
        agentLookupRef={agentLookupRef}
        scaleMultiplier={PLAYER_SCALE_MULTIPLIER}
        tint="#7a6b9f"
        animationOverride={animationOverride}
      />
    </group>
  );
}
