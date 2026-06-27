import * as THREE from "three";
import { clone as SkeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  validateFirstPersonRig,
  type RigSocketMap,
  type RigValidationResult,
} from "./AssetRigValidator";
import { createGeneratedOfficeActionClips } from "./officeActionClips";
import { fallbackPoseFor } from "./interactionMapping";
import type {
  FirstPersonRigConfig,
  FirstPersonSocketName,
  HandAction,
} from "./types";

export interface FirstPersonRigAdapter {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  sockets: RigSocketMap;
  validation: RigValidationResult;
  play: (action: HandAction) => void;
  update: (delta: number) => void;
}

function cloneVisibleRig(source: THREE.Object3D): THREE.Group {
  const clone = SkeletonClone(source) as THREE.Group;
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    child.renderOrder = 1000;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const clonedMaterials = materials.map((material) => {
      const next = material.clone();
      next.depthTest = false;
      next.depthWrite = false;
      next.side = THREE.DoubleSide;
      const maybeTextured = next as THREE.Material & {
        color?: THREE.Color;
        map?: THREE.Texture | null;
      };
      if (maybeTextured.color instanceof THREE.Color && !maybeTextured.map) {
        maybeTextured.color.set("#d8b097");
      }
      return next;
    });
    child.material = Array.isArray(child.material)
      ? clonedMaterials
      : clonedMaterials[0];
  });
  return clone;
}

function normalizeRigRoot(root: THREE.Group): [number, number, number] {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return [-center.x, -center.y, -center.z];
}

function isStableFirstPersonTrack(track: THREE.KeyframeTrack): boolean {
  const name = track.name.toLowerCase();
  if (!name.endsWith(".quaternion")) return false;
  const target = name.slice(0, name.lastIndexOf("."));
  const compactTarget = target.replace(/[^a-z0-9]/g, "");
  if (
    compactTarget === "root" ||
    compactTarget === "camera" ||
    compactTarget === "armsrig" ||
    compactTarget.includes("ik")
  ) {
    return false;
  }
  return true;
}

function sanitizeFirstPersonAnimationClips(
  clips: THREE.AnimationClip[],
): THREE.AnimationClip[] {
  return clips
    .map((clip) => {
      const stableTracks = clip.tracks.filter(isStableFirstPersonTrack);
      if (stableTracks.length === clip.tracks.length) return clip;
      return new THREE.AnimationClip(clip.name, clip.duration, stableTracks);
    })
    .filter((clip) => clip.tracks.length > 0);
}

export function createFirstPersonRigAdapter({
  scene,
  animations,
  config,
}: {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  config: FirstPersonRigConfig;
}): FirstPersonRigAdapter {
  const root = cloneVisibleRig(scene);
  const normalizedOffset = normalizeRigRoot(root);
  root.position.set(...normalizedOffset);
  const stableAssetAnimations = sanitizeFirstPersonAnimationClips(animations);
  const effectiveAnimations = config.generatedOfficeActions
    ? [...stableAssetAnimations, ...createGeneratedOfficeActionClips(root)]
    : stableAssetAnimations;
  const validation = validateFirstPersonRig({
    scene: root,
    animations: effectiveAnimations,
    config,
  });
  const mixer = new THREE.AnimationMixer(root);
  let activeAction: THREE.AnimationAction | null = null;

  const play = (nextAction: HandAction): void => {
    const fallbackAction = fallbackPoseFor(nextAction);
    const clip =
      validation.actions[nextAction] ??
      validation.actions[fallbackAction] ??
      validation.actions.idle;
    if (!clip) return;
    const animationAction = mixer.clipAction(clip, root);
    animationAction.reset();
    const repeat =
      nextAction === "idle" ||
      nextAction === "walk" ||
      nextAction === "holdItem" ||
      nextAction === "hold_one_hand" ||
      nextAction === "hold_two_hand";
    animationAction.setLoop(
      repeat ? THREE.LoopRepeat : THREE.LoopOnce,
      repeat ? Number.POSITIVE_INFINITY : 1,
    );
    animationAction.clampWhenFinished =
      nextAction !== "idle" && nextAction !== "walk";
    animationAction.fadeIn(0.08).play();
    if (activeAction && activeAction !== animationAction) {
      activeAction.fadeOut(0.12);
    }
    activeAction = animationAction;
  };

  return {
    root,
    mixer,
    sockets: validation.sockets,
    validation,
    play,
    update: (delta: number): void => {
      mixer.update(Math.min(delta, 1 / 30));
    },
  };
}

export function getPrimaryHeldItemSocket(
  sockets: RigSocketMap,
): THREE.Object3D | undefined {
  return (
    sockets.heldItem ??
    sockets.rightGrip ??
    sockets.rightPalm ??
    sockets.rightWrist
  );
}

export function getSecondaryHeldItemSocket(
  sockets: RigSocketMap,
): THREE.Object3D | undefined {
  return sockets.leftGrip ?? sockets.leftPalm ?? sockets.leftWrist;
}

export function hasSocket(
  sockets: RigSocketMap,
  socket: FirstPersonSocketName,
): boolean {
  return Boolean(sockets[socket]);
}
