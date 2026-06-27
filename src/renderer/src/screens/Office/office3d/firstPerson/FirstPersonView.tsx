import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { FirstPersonMotionState } from "./types";

export function FirstPersonView({
  motion,
  children,
}: {
  motion: FirstPersonMotionState;
  children: React.ReactNode;
}): React.JSX.Element {
  const { camera } = useThree();
  const rootRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const root = rootRef.current;
    if (!root) return;
    const t = state.clock.elapsedTime;
    const breath = Math.sin(t * 1.55) * 0.006;
    const sprinting = Boolean(motion.moving && motion.sprinting);
    const gaitRate = sprinting ? 10.6 : 7.6;
    const bob = motion.moving
      ? Math.abs(Math.sin(t * gaitRate)) * (sprinting ? 0.016 : 0.01)
      : 0;
    const sway = motion.moving
      ? Math.sin(t * gaitRate * 0.5) * (sprinting ? 0.006 : 0.003)
      : 0;
    root.position.copy(camera.position);
    root.quaternion.copy(camera.quaternion);
    root.translateY(breath + bob);
    root.translateX(sway);
  });

  return (
    <group ref={rootRef} renderOrder={1000}>
      {children}
    </group>
  );
}
