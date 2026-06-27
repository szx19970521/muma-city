import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  createFirstPersonRigAdapter,
  type FirstPersonRigAdapter,
} from "./FirstPersonRigAdapter";
import {
  createFirstPersonArmsAnimator,
  type FirstPersonArmsAnimator,
} from "./FirstPersonArmsAnimator";
import { FIRST_PERSON_RIG_CONFIG } from "./rigConfig";
import type { FirstPersonMotionState, HandActionEvent } from "./types";

export function RiggedArmsRenderer({
  action,
  motion,
}: {
  action: HandActionEvent;
  motion: FirstPersonMotionState;
}): React.JSX.Element | null {
  const animationSources = FIRST_PERSON_RIG_CONFIG.animationSources ?? [];
  const assetUrls = useMemo(
    () => [
      FIRST_PERSON_RIG_CONFIG.activeRigUrl,
      ...animationSources.map((source) => source.url),
    ],
    [animationSources],
  );
  const loadedAssets = useLoader(FBXLoader, assetUrls);
  const scene = loadedAssets[0];
  const animations = useMemo(
    () =>
      loadedAssets
        .slice(1)
        .flatMap((asset, index) =>
          asset.animations.map((clip) => {
            const nextClip = clip.clone();
            nextClip.name = animationSources[index]?.action ?? clip.name;
            return nextClip;
          }),
        ),
    [animationSources, loadedAssets],
  );
  const groupRef = useRef<THREE.Group>(null);
  const adapter = useMemo<FirstPersonRigAdapter>(
    () =>
      createFirstPersonRigAdapter({
        scene,
        animations,
        config: FIRST_PERSON_RIG_CONFIG,
      }),
    [animations, scene],
  );
  const animator = useMemo<FirstPersonArmsAnimator>(
    () => createFirstPersonArmsAnimator(adapter),
    [adapter],
  );

  useEffect(() => {
    if (!adapter.validation.previewOnly) return;
    console.warn(
      "[first-person] Rig is hidden because it failed strict validation:",
      adapter.validation.warnings,
    );
  }, [adapter.validation.previewOnly, adapter.validation.warnings]);

  useEffect(() => {
    if (!adapter.validation.usable || adapter.validation.previewOnly) return;
    animator.playInitial();
  }, [adapter.validation.previewOnly, adapter.validation.usable, animator]);

  useEffect(() => {
    if (!adapter.validation.usable || adapter.validation.previewOnly) return;
    animator.playEvent(action);
  }, [action, adapter.validation.previewOnly, adapter.validation.usable, animator]);

  useFrame((_state, delta) => {
    if (!adapter.validation.usable || adapter.validation.previewOnly) return;
    animator.update(delta, motion);
    const group = groupRef.current;
    if (!group) return;
    const jumpLift = motion.jumping ? 0.025 : 0;
    group.position.set(
      FIRST_PERSON_RIG_CONFIG.rootTransform.position[0],
      FIRST_PERSON_RIG_CONFIG.rootTransform.position[1] - jumpLift,
      FIRST_PERSON_RIG_CONFIG.rootTransform.position[2],
    );
    group.rotation.set(
      FIRST_PERSON_RIG_CONFIG.rootTransform.rotation[0],
      FIRST_PERSON_RIG_CONFIG.rootTransform.rotation[1],
      FIRST_PERSON_RIG_CONFIG.rootTransform.rotation[2],
    );
  });

  if (!adapter.validation.usable || adapter.validation.previewOnly) return null;

  return (
    <group
      ref={groupRef}
      position={FIRST_PERSON_RIG_CONFIG.rootTransform.position}
      rotation={FIRST_PERSON_RIG_CONFIG.rootTransform.rotation}
      scale={FIRST_PERSON_RIG_CONFIG.rootTransform.scale}
    >
      <primitive object={adapter.root} />
    </group>
  );
}
