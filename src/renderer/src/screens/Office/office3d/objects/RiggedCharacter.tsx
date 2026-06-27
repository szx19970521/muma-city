import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as SkeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AgentAvatarProfile } from "../avatars/profile";
import type { RenderAgent } from "../core/types";
import { DIVIDER_X } from "../layout";
import bizManGlbUrl from "../assets/biz_man.glb?url";
import manGlbUrl from "../assets/man.glb?url";
import rocketboxAvatarUrl from "../assets/rocketbox/Assets/Avatars/Professions/Female_Party_02/Export/Female_Party_02_facial.fbx?url";
import rocketboxGesticTalkUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_static/f_gestic_talk_neutral_01.max.fbx?url";
import rocketboxIdleUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_static/f_idle_neutral_01.max.fbx?url";
import rocketboxKnockDoorUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_static/f_knock_door.max.fbx?url";
import rocketboxSitChairUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_static/f_sit_chair_breathe_01.max.fbx?url";
import rocketboxTryDoorUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_static/f_try_door_inwards.max.fbx?url";
import rocketboxWorkTableUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_static/f_work_table.max.fbx?url";
import rocketboxWalkUrl from "../assets/rocketbox/Assets/Animations/all_animations_max_motextr_xy/f_walk_neutral.max.fbx?url";
import quaterniusAnimationLibraryUrl from "../assets/quaternius/universal-animation-library/AnimationLibrary_Godot_Standard.glb?url";
import quaterniusAnimationLibrary2Url from "../assets/quaternius/universal-animation-library-2/UAL2_Standard.glb?url";

export const ROCKETBOX_AGENT_URL = rocketboxAvatarUrl;
export const RIGGED_EMPLOYEE_URL = ROCKETBOX_AGENT_URL;
export const RIGGED_MAN_URL = ROCKETBOX_AGENT_URL;
export const LEGACY_RIGGED_EMPLOYEE_URL = bizManGlbUrl;
export const LEGACY_RIGGED_MAN_URL = manGlbUrl;
export const QUATERNIUS_ANIMATION_LIBRARY_URL = quaterniusAnimationLibraryUrl;
export const QUATERNIUS_ANIMATION_LIBRARY_2_URL = quaterniusAnimationLibrary2Url;

const DEFAULT_AGENT_HEIGHT = 0.65;
const ROCKETBOX_WALK_TIME_SCALE = 0.7;
const ROCKETBOX_MATERIAL_EMISSIVE = 0.035;
const OFFICE_CLOTHING_COLOR = "#7b5263";
const DEFAULT_OFFICE_CLOTHING_COLOR = "#8a5167";

const ROCKETBOX_ANIMATION_SOURCES = [
  { key: "idle", url: rocketboxIdleUrl },
  { key: "walk", url: rocketboxWalkUrl },
  { key: "sit_chair", url: rocketboxSitChairUrl },
  { key: "work_table", url: rocketboxWorkTableUrl },
  { key: "gestic_talk", url: rocketboxGesticTalkUrl },
  { key: "try_door", url: rocketboxTryDoorUrl },
  { key: "knock_door", url: rocketboxKnockDoorUrl },
] as const;

type RocketboxAnimationKey = (typeof ROCKETBOX_ANIMATION_SOURCES)[number]["key"];

export type RiggedAnimationClipKey =
  | "idle"
  | "walk"
  | "sprint"
  | "jump"
  | "sit"
  | "sit_chair"
  | "work_table"
  | "gestic_talk"
  | "talk"
  | "interact"
  | "pick_up"
  | "push"
  | "dance"
  | "crouch"
  | "drive"
  | "try_door"
  | "knock_door";

export type RiggedAnimationClipOverride = RiggedAnimationClipKey | string;

const RIGGED_ANIMATION_CLIP_KEYS = new Set<string>([
  "idle",
  "walk",
  "sprint",
  "jump",
  "sit",
  "sit_chair",
  "work_table",
  "gestic_talk",
  "talk",
  "interact",
  "pick_up",
  "push",
  "dance",
  "crouch",
  "drive",
  "try_door",
  "knock_door",
]);

function isRiggedAnimationClipKey(
  key: RiggedAnimationClipOverride | null | undefined,
): key is RiggedAnimationClipKey {
  return typeof key === "string" && RIGGED_ANIMATION_CLIP_KEYS.has(key);
}

export function resolveRiggedAnimationClipKey(
  agent: Pick<RenderAgent, "state" | "walkSpeed">,
): RiggedAnimationClipKey {
  if (agent.state === "walking") {
    return "walk";
  }
  if (agent.state === "sitting") {
    return "sit_chair";
  }
  if (agent.state === "working_at_desk") {
    // Rocketbox's bundled `work_table` clip is a standing table interaction,
    // not a seated keyboard/mouse office pose. For task execution the agent
    // must remain seated at the workstation, so use the chair animation as the
    // stable first-pass desk pose.
    return "sit_chair";
  }
  if (
    agent.state === "using_memory" ||
    agent.state === "using_comms" ||
    agent.state === "using_tools"
  ) {
    return "work_table";
  }
  if (agent.state === "talking_to_player") {
    return "gestic_talk";
  }
  if (agent.state === "opening_door") {
    return "try_door";
  }
  return "idle";
}

export function shouldApplyDeskArmPose(
  agent: Pick<RenderAgent, "state" | "x">,
): boolean {
  return (
    agent.state === "working_at_desk" ||
    (agent.state === "sitting" && agent.x <= DIVIDER_X)
  );
}

function computeAutoScale(bbox: THREE.Box3): number {
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const modelHeight = size.y;
  if (modelHeight <= 0) return 1;
  return DEFAULT_AGENT_HEIGHT / modelHeight;
}

function findAnimationByName(
  names: string[],
  target: string,
): number | undefined {
  const wanted = target.toLowerCase();
  // Clip names are often prefixed by the armature (e.g. "Armature|Walk") and/or
  // namespaced (e.g. "Man_Walk", "Man_Sitting"). Compare against the trailing
  // segment after the last "|", then match either the whole leaf or one of its
  // tokens (split on non-alphanumerics) so "Man_Walk" matches "walk".
  const idx = names.findIndex((n) => {
    const leaf = (n.split("|").pop() ?? n).toLowerCase();
    if (leaf === wanted) return true;
    const tokens = leaf.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.includes(wanted);
  });
  return idx >= 0 ? idx : undefined;
}

function resolveRocketboxFallbackKey(
  key: RiggedAnimationClipKey,
): RocketboxAnimationKey {
  if (key === "sprint") return "walk";
  if (key === "sit") return "sit_chair";
  if (key === "knock_door") return "knock_door";
  if (
    key === "idle" ||
    key === "walk" ||
    key === "sit_chair" ||
    key === "work_table" ||
    key === "gestic_talk" ||
    key === "try_door"
  ) {
    return key;
  }
  return "idle";
}

function shouldLoopGlbAnimationClip(
  clipName: string | undefined,
  fallbackClampWhenFinished: boolean,
): boolean {
  const name = (clipName ?? "").toLowerCase();
  if (
    name.includes("loop") ||
    name.includes("idle") ||
    name.includes("walk") ||
    name.includes("jog") ||
    name.includes("sprint") ||
    name.includes("drive") ||
    name.includes("swim") ||
    name.includes("dance") ||
    name.includes("push")
  ) {
    return true;
  }
  if (
    name.includes("enter") ||
    name.includes("exit") ||
    name.includes("start") ||
    name.includes("land") ||
    name.includes("pickup") ||
    name.includes("interact") ||
    name.includes("hit") ||
    name.includes("death") ||
    name.includes("reload") ||
    name.includes("shoot") ||
    name.includes("attack") ||
    name.includes("punch") ||
    name.includes("roll") ||
    name.includes("fix")
  ) {
    return false;
  }
  return !fallbackClampWhenFinished;
}

function resolveGlbAnimationTimeScale(
  clipName: string | undefined,
  agent: Pick<RenderAgent, "state" | "walkSpeed">,
): number {
  if (agent.state !== "walking") return 1;
  const name = (clipName ?? "").toLowerCase();
  if (name.includes("sprint") || name.includes("run") || name.includes("jog")) {
    return agent.walkSpeed > 2.5 ? 1.18 : 1;
  }
  if (name.includes("walk")) {
    return agent.walkSpeed > 2.5 ? 1.38 : 1;
  }
  return 1;
}

export function softenRocketboxTint(tint: string | null): THREE.Color {
  const base = new THREE.Color(tint ?? DEFAULT_OFFICE_CLOTHING_COLOR);
  return base.lerp(new THREE.Color(OFFICE_CLOTHING_COLOR), 0.45);
}

function isLoopingRocketboxClip(key: RocketboxAnimationKey): boolean {
  return (
    key === "idle" ||
    key === "walk" ||
    key === "sit_chair" ||
    key === "work_table" ||
    key === "gestic_talk"
  );
}

export function stabilizeRocketboxAnimationClip(
  key: RocketboxAnimationKey,
  clip: THREE.AnimationClip,
): THREE.AnimationClip {
  if (key !== "walk") return clip;
  const stable = clip.clone();
  stable.tracks = stable.tracks.map((track) => {
    if (!track.name.toLowerCase().endsWith(".position")) return track;
    const values = Array.from(track.values);
    if (values.length < 3) return track;
    const firstX = values[0] ?? 0;
    const firstZ = values[2] ?? 0;
    for (let i = 0; i < values.length; i += 3) {
      values[i] = firstX;
      values[i + 2] = firstZ;
    }
    return new THREE.VectorKeyframeTrack(track.name, track.times, values);
  });
  return stable;
}

export function resolveRocketboxMaterialColor(
  meshName: string,
  materialName: string,
  tint: string | null,
  appearance?: AgentAvatarProfile | null,
): THREE.Color {
  const mesh = meshName.toLowerCase();
  const material = materialName.toLowerCase();
  const name = `${mesh} ${material}`;

  // The Rocketbox FBX embeds broken paths like
  // `with_opacity_version/.../*.tga`. Do not use the word "opacity" from the
  // file path/mesh hierarchy as a body-part signal, or the whole avatar turns
  // into a black silhouette. Only the explicit material name is meaningful.
  if (/f022_head|(^|[^a-z])head([^a-z]|$)|face/.test(material)) {
    return new THREE.Color(appearance?.body.skinTone ?? "#c78662");
  }
  if (/f022_body|shirt|top|torso|cloth|jacket|dress|body/.test(material)) {
    return softenRocketboxTint(appearance?.clothing.topColor ?? tint);
  }
  if (/f022_opacity/.test(material)) {
    return new THREE.Color(appearance?.hair.color ?? "#33251f");
  }
  if (/hair|brow|lash/.test(name)) {
    return new THREE.Color(appearance?.hair.color ?? "#211915");
  }
  if (/eye/.test(name)) return new THREE.Color("#f4f4ef");
  if (/shoe|boot/.test(name)) {
    return new THREE.Color(appearance?.clothing.shoesColor ?? "#171717");
  }
  if (/pant|trouser|short|leg/.test(name)) {
    return new THREE.Color(appearance?.clothing.bottomColor ?? "#26303b");
  }
  if (/skin|face|head|hand|arm|body/.test(name)) {
    return new THREE.Color(appearance?.body.skinTone ?? "#b97755");
  }
  if (/shirt|top|torso|cloth|jacket|dress/.test(name)) {
    return softenRocketboxTint(appearance?.clothing.topColor ?? tint);
  }
  return softenRocketboxTint(appearance?.clothing.topColor ?? tint);
}

function tintSceneMaterials(
  root: THREE.Object3D,
  tint: string | null,
  appearance?: AgentAvatarProfile | null,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const tinted = mats.map((material) => {
      const mat = material as THREE.MeshStandardMaterial;
      const baseColor = resolveRocketboxMaterialColor(
        child.name,
        mat.name,
        tint,
        appearance,
      );
      const next = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor.clone().multiplyScalar(ROCKETBOX_MATERIAL_EMISSIVE),
        roughness: 0.64,
        metalness: 0.02,
        side: THREE.FrontSide,
      });
      next.name = mat.name;
      return next;
    });
    child.material = Array.isArray(child.material) ? tinted : tinted[0];
  });
}

type RiggedCharacterProps = {
  url: string;
  agentId: string;
  agentsRef: React.RefObject<RenderAgent[]>;
  agentLookupRef?: React.RefObject<Map<string, RenderAgent>>;
  scaleMultiplier?: number;
  /** Recolours the model's materials toward this colour (per-instance). */
  tint?: string | null;
  appearance?: AgentAvatarProfile | null;
  /** Optional lab-only clip override. Formal Office agents should use state. */
  animationOverride?: RiggedAnimationClipOverride | null;
};

export function RiggedCharacter(props: RiggedCharacterProps) {
  if (props.url.toLowerCase().includes(".fbx")) {
    return <RocketboxCharacter {...props} />;
  }
  return <GlbRiggedCharacter {...props} />;
}

function RocketboxCharacter({
  url,
  agentId,
  agentsRef,
  agentLookupRef,
  scaleMultiplier = 1.45,
  tint = null,
  appearance = null,
  animationOverride = null,
}: RiggedCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const avatarScene = useLoader(FBXLoader, url);
  const animationScenes = useLoader(
    FBXLoader,
    ROCKETBOX_ANIMATION_SOURCES.map((source) => source.url),
  );
  const { invalidate } = useThree();

  const clonedScene = useMemo(() => {
    const cloned = SkeletonClone(avatarScene);
    cloned.updateMatrixWorld(true);
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    tintSceneMaterials(cloned, tint, appearance);
    return cloned;
  }, [appearance, avatarScene, tint]);

  const { autoScale, bboxMin, bboxCenter } = useMemo(() => {
    clonedScene.updateWorldMatrix(true, true);
    const bbox = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    const min = bbox.min.clone();
    bbox.getCenter(center);
    return {
      autoScale: computeAutoScale(bbox),
      bboxMin: min,
      bboxCenter: center,
    };
  }, [clonedScene]);

  const { mixer, clipMap } = useMemo(() => {
    const m = new THREE.AnimationMixer(clonedScene);
    const map = new Map<RocketboxAnimationKey, THREE.AnimationClip>();
    animationScenes.forEach((scene, index) => {
      const key = ROCKETBOX_ANIMATION_SOURCES[index]?.key;
      const clip = scene.animations[0];
      if (key && clip) {
        const stableClip = stabilizeRocketboxAnimationClip(
          key,
          clip,
        ) as THREE.AnimationClip;
        stableClip.name = key;
        map.set(key, stableClip);
      }
    });
    return { mixer: m, clipMap: map };
  }, [animationScenes, clonedScene]);

  const currentClipKeyRef = useRef<RocketboxAnimationKey | null>(null);

  useEffect(() => {
    currentClipKeyRef.current = null;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
    };
  }, [mixer, clonedScene]);

  useFrame((_, delta) => {
    const agents = agentsRef.current;
    if (!agents) return;
    const agent =
      agentLookupRef?.current?.get(agentId) ??
      agents.find((a) => a.id === agentId);
    if (!agent) return;

    const desiredKey = resolveRocketboxFallbackKey(
      isRiggedAnimationClipKey(animationOverride)
        ? animationOverride
        : resolveRiggedAnimationClipKey(agent),
    );
    const clipKey = clipMap.has(desiredKey) ? desiredKey : "idle";
    const clip = clipMap.get(clipKey);
    if (clip && clipKey !== currentClipKeyRef.current) {
      const previousKey = currentClipKeyRef.current;
      const previousClip = previousKey ? clipMap.get(previousKey) : undefined;
      if (previousClip) {
        mixer.clipAction(previousClip, clonedScene).fadeOut(0.22);
      }
      const nextAction = mixer.clipAction(clip, clonedScene);
      if (isLoopingRocketboxClip(clipKey)) {
        nextAction.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
        nextAction.clampWhenFinished = false;
      } else {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
      }
      nextAction.timeScale = clipKey === "walk" ? ROCKETBOX_WALK_TIME_SCALE : 1;
      nextAction.reset().setEffectiveWeight(1).fadeIn(0.22).play();
      currentClipKeyRef.current = clipKey;
    }

    mixer.update(Math.min(delta, 1 / 30));
    invalidate();
  });

  return (
    <group ref={groupRef}>
      <primitive
        object={clonedScene}
        scale={autoScale * scaleMultiplier}
        position={[
          -bboxCenter.x * autoScale * scaleMultiplier,
          -bboxMin.y * autoScale * scaleMultiplier,
          -bboxCenter.z * autoScale * scaleMultiplier,
        ]}
      />
    </group>
  );
}

function GlbRiggedCharacter({
  url,
  agentId,
  agentsRef,
  agentLookupRef,
  scaleMultiplier = 1.45,
  tint = null,
  animationOverride = null,
}: RiggedCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { invalidate } = useThree();

  const clonedScene = useMemo(() => {
    const cloned = SkeletonClone(scene);
    cloned.updateMatrixWorld(true);
    const tintColor = tint ? new THREE.Color(tint) : null;

    // Detect whether the model has a separately-named "Shirt" material.
    // If so we tint only that material; otherwise fall back to tinting all
    // meshes so the agent still gets coloured.
    let hasShirtMaterial = false;
    if (tintColor) {
      cloned.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          if (
            mats.some((m) => (m as THREE.MeshStandardMaterial).name === "Shirt")
          ) {
            hasShirtMaterial = true;
          }
        }
      });
    }

    // Skinned meshes frequently get incorrectly frustum-culled because their
    // bounding sphere stays at the rig origin, making the avatar vanish.
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;
        // SkeletonClone shares material references with the cached GLTF scene,
        // so tinting in place would recolour every agent using this model.
        // Clone the materials per instance, then lerp toward the agent's tint.
        if (tintColor) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          const tinted = mats.map((material) => {
            const mat = material as THREE.MeshStandardMaterial;
            const next = mat.clone() as THREE.Material & {
              color?: THREE.Color;
            };
            // Only tint the "Shirt" material when we found one; otherwise
            // tint every material as a fallback.
            if (next.color && (!hasShirtMaterial || mat.name === "Shirt")) {
              next.color.lerp(tintColor, 0.6);
            }
            return next;
          });
          child.material = Array.isArray(child.material) ? tinted : tinted[0];
        }
      }
    });
    return cloned;
  }, [scene, tint]);

  const { autoScale, bboxMin, bboxCenter } = useMemo(() => {
    clonedScene.updateWorldMatrix(true, true);
    const bbox = new THREE.Box3().setFromObject(clonedScene);
    const center = new THREE.Vector3();
    const min = bbox.min.clone();
    bbox.getCenter(center);
    const scaleValue = computeAutoScale(bbox);
    return { autoScale: scaleValue, bboxMin: min, bboxCenter: center };
  }, [clonedScene]);

  const { mixer, clipMap, clipIndexByName } = useMemo(() => {
    const m = new THREE.AnimationMixer(clonedScene);
    const names = animations.map((c) => c.name);
    const byName = new Map<string, number>();
    animations.forEach((clip, index) => {
      byName.set(clip.name, index);
      const leaf = clip.name.split("|").pop();
      if (leaf && !byName.has(leaf)) {
        byName.set(leaf, index);
      }
    });
    const map: Record<string, number | undefined> = {
      idle: findAnimationByName(names, "idle"),
      walk: findAnimationByName(names, "walk"),
      // biz_man.glb has no "Sprint" clip — fall back to "Run".
      sprint:
        findAnimationByName(names, "sprint") ??
        findAnimationByName(names, "jog") ??
        findAnimationByName(names, "run"),
      jump: findAnimationByName(names, "jump"),
      sit:
        findAnimationByName(names, "sit") ??
        findAnimationByName(names, "sitting") ??
        findAnimationByName(names, "chair") ??
        findAnimationByName(names, "seated"),
      talk:
        findAnimationByName(names, "talking") ??
        findAnimationByName(names, "talk"),
      interact: findAnimationByName(names, "interact"),
      pick_up:
        findAnimationByName(names, "pickup") ??
        findAnimationByName(names, "pick") ??
        findAnimationByName(names, "grab"),
      push: findAnimationByName(names, "push"),
      dance: findAnimationByName(names, "dance"),
      crouch: findAnimationByName(names, "crouch"),
      drive: findAnimationByName(names, "driving"),
    };
    return { mixer: m, clipMap: map, clipIndexByName: byName };
  }, [animations, clonedScene]);

  // Index of the clip currently faded in. Tracked so we only crossfade when the
  // target actually changes — re-triggering reset()/fadeIn() every frame snaps
  // the clip back to frame 0 and looks like a jittery hop.
  const currentClipIdxRef = useRef<number | null>(null);

  useEffect(() => {
    currentClipIdxRef.current = null;
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
    };
  }, [mixer, clonedScene]);

  useFrame((_, delta) => {
    const agents = agentsRef.current;
    if (!agents) return;
    const agent =
      agentLookupRef?.current?.get(agentId) ??
      agents.find((a) => a.id === agentId);
    if (!agent) return;

    const isDeskSideTalking =
      agent.state === "talking_to_player" && agent.x <= DIVIDER_X;
    const requestedClip = animationOverride ?? resolveRiggedAnimationClipKey(agent);
    const wantsSeatedClip =
      requestedClip === "sit_chair" ||
      requestedClip === "work_table" ||
      isDeskSideTalking;
    let targetClipIdx: number | undefined;
    if (animationOverride) {
      targetClipIdx = isRiggedAnimationClipKey(animationOverride)
        ? clipMap[animationOverride]
        : undefined;
      targetClipIdx ??= clipIndexByName.get(animationOverride);
    } else if (agent.state === "walking") {
      targetClipIdx = agent.walkSpeed > 2.5 ? clipMap.sprint : clipMap.walk;
    } else if (wantsSeatedClip) {
      targetClipIdx = clipMap.sit ?? clipMap.idle;
    } else {
      // standing / away / etc. — settle into idle.
      targetClipIdx = clipMap.idle;
    }
    if (targetClipIdx === undefined) targetClipIdx = clipMap.idle;

    if (
      targetClipIdx !== undefined &&
      targetClipIdx !== currentClipIdxRef.current
    ) {
      const prevIdx = currentClipIdxRef.current;
      if (prevIdx !== null && animations[prevIdx]) {
        mixer.clipAction(animations[prevIdx], clonedScene).fadeOut(0.25);
      }
      const nextAction = mixer.clipAction(
        animations[targetClipIdx],
        clonedScene,
      );
      const shouldLoop = shouldLoopGlbAnimationClip(
        animations[targetClipIdx]?.name,
        wantsSeatedClip,
      );
      nextAction.timeScale = resolveGlbAnimationTimeScale(
        animations[targetClipIdx]?.name,
        agent,
      );
      if (shouldLoop) {
        nextAction.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
        nextAction.clampWhenFinished = false;
      } else {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
      }
      nextAction.reset().setEffectiveWeight(1).fadeIn(0.25).play();
      currentClipIdxRef.current = targetClipIdx;
    }

    if (currentClipIdxRef.current !== null && animations[currentClipIdxRef.current]) {
      mixer.clipAction(
        animations[currentClipIdxRef.current],
        clonedScene,
      ).timeScale = resolveGlbAnimationTimeScale(
        animations[currentClipIdxRef.current]?.name,
        agent,
      );
    }

    mixer.update(Math.min(delta, 1 / 30));
    invalidate();
  });

  return (
    <group ref={groupRef}>
      <primitive
        object={clonedScene}
        scale={autoScale * scaleMultiplier}
        position={[
          -bboxCenter.x * autoScale * scaleMultiplier,
          -bboxMin.y * autoScale * scaleMultiplier,
          -bboxCenter.z * autoScale * scaleMultiplier,
        ]}
      />
    </group>
  );
}

useGLTF.preload(bizManGlbUrl);
useGLTF.preload(manGlbUrl);
