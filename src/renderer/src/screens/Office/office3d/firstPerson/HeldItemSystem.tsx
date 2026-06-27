import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HandAction, HeldItemKind } from "./types";

const HELD_ITEM_VIEW_TRANSFORMS: Record<
  Exclude<HeldItemKind, "none">,
  {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  }
> = {
  book: {
    position: [-0.01, -0.42, -0.86],
    rotation: [0.1, -0.08, -0.02],
    scale: 0.66,
  },
  taskCard: {
    position: [0.02, -0.38, -0.78],
    rotation: [0.12, -0.12, -0.04],
    scale: 0.58,
  },
  tablet: {
    position: [0, -0.42, -0.9],
    rotation: [0.12, 0, 0],
    scale: 0.56,
  },
  tool: {
    position: [0.24, -0.44, -0.82],
    rotation: [0.18, -0.38, 0.18],
    scale: 0.42,
  },
};

const DEPTHLESS_MATERIAL_OPTIONS = {
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
};

function mat(color: string, roughness = 0.62): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.04,
    ...DEPTHLESS_MATERIAL_OPTIONS,
  });
}

function BookItem(): React.JSX.Element {
  return (
    <group rotation={[0.18, -0.16, -0.1]}>
      <mesh renderOrder={1200} castShadow={false}>
        <boxGeometry args={[0.34, 0.03, 0.24]} />
        <primitive object={mat("#d4a94d", 0.5)} attach="material" />
      </mesh>
      <mesh position={[0, 0.021, 0.01]} renderOrder={1201}>
        <boxGeometry args={[0.31, 0.018, 0.2]} />
        <primitive object={mat("#f5ecd0", 0.72)} attach="material" />
      </mesh>
      <mesh position={[-0.145, 0.038, 0]} renderOrder={1202}>
        <boxGeometry args={[0.02, 0.025, 0.22]} />
        <primitive object={mat("#7a4a16", 0.44)} attach="material" />
      </mesh>
    </group>
  );
}

function TaskCardItem(): React.JSX.Element {
  return (
    <group rotation={[0.1, -0.22, -0.05]}>
      <mesh renderOrder={1200}>
        <boxGeometry args={[0.28, 0.018, 0.18]} />
        <primitive object={mat("#f8fafc", 0.52)} attach="material" />
      </mesh>
      <mesh position={[0, 0.012, -0.052]} renderOrder={1201}>
        <boxGeometry args={[0.22, 0.006, 0.018]} />
        <primitive object={mat("#2563eb", 0.42)} attach="material" />
      </mesh>
      <mesh position={[0, 0.013, 0.035]} renderOrder={1201}>
        <boxGeometry args={[0.18, 0.006, 0.018]} />
        <primitive object={mat("#f59e0b", 0.42)} attach="material" />
      </mesh>
    </group>
  );
}

function TabletItem(): React.JSX.Element {
  return (
    <group rotation={[0.16, 0, -0.02]}>
      <mesh renderOrder={1200}>
        <boxGeometry args={[0.36, 0.028, 0.23]} />
        <primitive object={mat("#111827", 0.4)} attach="material" />
      </mesh>
      <mesh position={[0, 0.018, 0]} renderOrder={1201}>
        <boxGeometry args={[0.31, 0.006, 0.18]} />
        <primitive object={mat("#0f5f96", 0.34)} attach="material" />
      </mesh>
      <mesh position={[0.095, 0.024, -0.035]} renderOrder={1202}>
        <boxGeometry args={[0.09, 0.005, 0.012]} />
        <primitive object={mat("#fde68a", 0.38)} attach="material" />
      </mesh>
    </group>
  );
}

function ToolItem(): React.JSX.Element {
  return (
    <group>
      <mesh position={[0, 0, 0]} renderOrder={1200}>
        <boxGeometry args={[0.045, 0.04, 0.25]} />
        <primitive object={mat("#334155", 0.36)} attach="material" />
      </mesh>
      <mesh position={[0, 0.018, -0.14]} renderOrder={1201}>
        <boxGeometry args={[0.105, 0.035, 0.052]} />
        <primitive object={mat("#94a3b8", 0.3)} attach="material" />
      </mesh>
      <mesh position={[0, -0.002, 0.15]} renderOrder={1201}>
        <boxGeometry args={[0.062, 0.038, 0.068]} />
        <primitive object={mat("#f59e0b", 0.4)} attach="material" />
      </mesh>
    </group>
  );
}

function HeldItemProxy({
  item,
}: {
  item: Exclude<HeldItemKind, "none">;
}): React.JSX.Element {
  switch (item) {
    case "book":
      return <BookItem />;
    case "taskCard":
      return <TaskCardItem />;
    case "tablet":
      return <TabletItem />;
    case "tool":
      return <ToolItem />;
  }
}

export function HeldItemSystem({
  item,
  action,
  tick,
}: {
  item: HeldItemKind;
  action: HandAction;
  tick: number;
}): React.JSX.Element | null {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(1);

  useEffect(() => {
    progressRef.current = 0;
  }, [action, tick, item]);

  useFrame((_, delta) => {
    if (item === "none") return;
    const group = groupRef.current;
    if (!group) return;
    const transform = HELD_ITEM_VIEW_TRANSFORMS[item];
    const progress = Math.min(1, progressRef.current + delta * 4.2);
    progressRef.current = progress;
    const ease = 1 - Math.pow(1 - progress, 3);
    const incoming = 1 - ease;
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;
    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;
    let scaleMultiplier = 1;

    if (action === "put_away" || action === "putAway") {
      offsetY = -0.22 * ease;
      offsetZ = 0.12 * ease;
      rotX = 0.35 * ease;
      scaleMultiplier = 1 - 0.24 * ease;
    } else if (action === "pickup_floor") {
      offsetY = -0.2 * incoming;
      offsetZ = 0.12 * incoming;
      rotX = -0.22 * incoming;
    } else if (action === "grab_shelf") {
      offsetY = 0.13 * incoming;
      offsetZ = -0.14 * incoming;
      rotY = -0.18 * incoming;
    } else if (action === "inspect") {
      offsetY = 0.04 * Math.sin(ease * Math.PI);
      rotY = 0.25 * Math.sin(ease * Math.PI);
    } else if (action === "hold_one_hand" || action === "hold_two_hand") {
      offsetY = 0.008 * Math.sin(performance.now() * 0.0022);
    }

    group.position.set(
      transform.position[0] + offsetX,
      transform.position[1] + offsetY,
      transform.position[2] + offsetZ,
    );
    group.rotation.set(
      transform.rotation[0] + rotX,
      transform.rotation[1] + rotY,
      transform.rotation[2] + rotZ,
    );
    group.scale.setScalar(transform.scale * scaleMultiplier);
  });

  if (item === "none") return null;
  const transform = HELD_ITEM_VIEW_TRANSFORMS[item];
  return (
    <group
      ref={groupRef}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
    >
      <HeldItemProxy item={item} />
    </group>
  );
}
