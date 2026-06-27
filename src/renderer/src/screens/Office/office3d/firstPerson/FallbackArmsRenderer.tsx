import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FirstPersonMotionState, HandActionEvent } from "./types";

const SKIN_MATERIAL_OPTIONS = {
  color: "#dfb99d",
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
};

const skinMaterial = new THREE.MeshBasicMaterial(SKIN_MATERIAL_OPTIONS);

function Hand({
  side,
  action,
  motion,
}: {
  side: -1 | 1;
  action: HandActionEvent;
  motion: FirstPersonMotionState;
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const actionStartRef = useRef(0);
  const lastTickRef = useRef(action.tick);

  useEffect(() => {
    actionStartRef.current = performance.now();
    lastTickRef.current = action.tick;
  }, [action.tick]);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    const t = state.clock.elapsedTime;
    const actionT = Math.min(1, (performance.now() - actionStartRef.current) / 360);
    const pulse = Math.sin(actionT * Math.PI);
    const sprinting = Boolean(motion.moving && motion.sprinting);
    const gaitRate = sprinting ? 10.2 : 7;
    const walkSway = motion.moving
      ? Math.sin(t * gaitRate + side * 0.7) * (sprinting ? 0.011 : 0.006)
      : 0;
    const runLift = sprinting ? Math.abs(Math.sin(t * gaitRate)) * 0.012 : 0;
    const jumpLift = motion.jumping ? -0.024 : 0;

    let reachZ = 0;
    let reachY = 0;
    let curl = 0;
    if (action.action === "click" || action.action === "press") {
      reachZ = -0.045 * pulse;
      reachY = 0.008 * pulse;
      curl = 0.12 * pulse;
    } else if (
      action.action === "grab_shelf" ||
      action.action === "reach_mid" ||
      action.action === "reach_high" ||
      action.action === "grab"
    ) {
      reachZ = -0.065 * pulse;
      reachY = 0.025 * pulse;
      curl = 0.16 * pulse;
    } else if (action.action === "pickup_floor") {
      reachZ = -0.045 * pulse;
      reachY = -0.04 * pulse;
      curl = 0.18 * pulse;
    } else if (
      action.action === "hold_one_hand" ||
      action.action === "hold_two_hand" ||
      action.action === "holdItem"
    ) {
      curl = 0.08;
    } else if (action.action === "put_away" || action.action === "putAway") {
      reachY = -0.04 * pulse;
      reachZ = 0.035 * pulse;
    }

    group.position.set(
      side * 0.24 + side * walkSway,
      -0.34 + runLift + jumpLift + reachY,
      -0.74 + reachZ,
    );
    group.rotation.set(
      -0.32 - curl,
      side * 0.16,
      side * -0.1 + walkSway * 2,
    );
  });

  return (
    <group ref={groupRef} renderOrder={1100}>
      <mesh
        position={[0, 0.01, 0.15]}
        rotation={[1.58, 0, side * 0.06]}
        frustumCulled={false}
      >
        <capsuleGeometry args={[0.028, 0.18, 8, 12]} />
        <primitive object={skinMaterial} attach="material" />
      </mesh>
      <mesh
        position={[0, 0.0, -0.025]}
        rotation={[0.08, 0, 0]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.078, 0.034, 0.102]} />
        <primitive object={skinMaterial} attach="material" />
      </mesh>
      {[-0.034, -0.012, 0.012, 0.034].map((x, index) => (
        <mesh
          key={x}
          position={[x * 0.86, -0.006, -0.085 - index * 0.003]}
          rotation={[-1.28, 0, side * 0.02]}
          frustumCulled={false}
        >
          <capsuleGeometry args={[0.006, 0.052 - index * 0.003, 6, 8]} />
          <primitive object={skinMaterial} attach="material" />
        </mesh>
      ))}
      <mesh
        position={[side * 0.05, -0.01, -0.035]}
        rotation={[-1.0, side * 0.18, side * 0.58]}
        frustumCulled={false}
      >
        <capsuleGeometry args={[0.008, 0.042, 6, 8]} />
        <primitive object={skinMaterial} attach="material" />
      </mesh>
    </group>
  );
}

export function FallbackArmsRenderer({
  action,
  motion,
}: {
  action: HandActionEvent;
  motion: FirstPersonMotionState;
}): React.JSX.Element {
  return (
    <>
      <Hand side={-1} action={action} motion={motion} />
      <Hand side={1} action={action} motion={motion} />
    </>
  );
}
