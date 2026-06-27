import * as THREE from "three";
import type {
  FirstPersonRigConfig,
  FirstPersonSocketName,
  HandAction,
} from "./types";

export type RigSocketMap = Partial<Record<FirstPersonSocketName, THREE.Object3D>>;

export interface RigValidationResult {
  usable: boolean;
  previewOnly: boolean;
  sockets: RigSocketMap;
  actions: Partial<Record<HandAction, THREE.AnimationClip>>;
  warnings: string[];
  bounds: {
    center: THREE.Vector3;
    size: THREE.Vector3;
  };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findByCandidates(
  root: THREE.Object3D,
  candidates: string[],
): THREE.Object3D | undefined {
  const normalized = candidates.map(normalizeName);
  let match: THREE.Object3D | undefined;
  root.traverse((node) => {
    if (match) return;
    const nodeName = normalizeName(node.name);
    if (normalized.some((candidate) => nodeName === candidate || nodeName.includes(candidate))) {
      match = node;
    }
  });
  return match;
}

function findActionClip(
  clips: THREE.AnimationClip[],
  candidates: string[],
): THREE.AnimationClip | undefined {
  const normalized = candidates.map(normalizeName);
  return clips.find((clip) => {
    const name = normalizeName(clip.name);
    return normalized.some((candidate) => name === candidate || name.includes(candidate));
  });
}

export function validateFirstPersonRig({
  scene,
  animations,
  config,
}: {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  config: FirstPersonRigConfig;
}): RigValidationResult {
  const warnings: string[] = [];
  let skinnedMeshCount = 0;
  let boneCount = 0;
  scene.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) skinnedMeshCount += 1;
    if (node instanceof THREE.Bone) boneCount += 1;
  });

  const sockets = Object.fromEntries(
    Object.entries(config.socketMap).map(([socketName, candidates]) => [
      socketName,
      findByCandidates(scene, candidates),
    ]),
  ) as RigSocketMap;

  const actions = Object.fromEntries(
    Object.entries(config.animationMap).map(([action, candidates]) => [
      action,
      findActionClip(animations, candidates),
    ]),
  ) as Partial<Record<HandAction, THREE.AnimationClip>>;

  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  if (skinnedMeshCount === 0) warnings.push("No SkinnedMesh found.");
  if (boneCount < 12) warnings.push(`Only ${boneCount} bones found.`);
  if (!sockets.leftPalm) warnings.push("Missing left palm socket.");
  if (!sockets.rightPalm) warnings.push("Missing right palm socket.");
  if (!sockets.heldItem) warnings.push("Missing held item socket.");
  if (!actions.idle) warnings.push("Missing idle animation.");
  if (!actions.walk) warnings.push("Missing walk animation.");
  if (!actions.holdItem) warnings.push("Missing holdItem animation.");
  if (!actions.putAway) warnings.push("Missing putAway animation.");
  if (!actions.grab) warnings.push("Missing grab animation.");
  if (!actions.press) warnings.push("Missing press animation.");
  if (size.length() === 0) warnings.push("Rig bounds are empty.");

  const usable =
    skinnedMeshCount > 0 &&
    boneCount >= 12 &&
    warnings.length === 0 &&
    Boolean(
      sockets.leftPalm &&
        sockets.rightPalm &&
        sockets.leftGrip &&
        sockets.rightGrip &&
        sockets.heldItem,
    );

  return {
    usable,
    previewOnly: warnings.length > 0,
    sockets,
    actions,
    warnings,
    bounds: { center, size },
  };
}
