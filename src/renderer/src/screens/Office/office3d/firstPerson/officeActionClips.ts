import * as THREE from "three";
import type { HandAction } from "./types";

type NamedObjectMap = Map<string, THREE.Object3D>;

const OFFICE_ACTIONS: HandAction[] = [
  "idle",
  "walk",
  "jump",
  "click",
  "reach_mid",
  "reach_high",
  "pickup_floor",
  "grab_shelf",
  "hold_one_hand",
  "hold_two_hand",
  "put_away",
  "inspect",
  "reach",
  "grab",
  "press",
  "point",
  "holdItem",
  "putAway",
];

function collectNamedObjects(root: THREE.Object3D): NamedObjectMap {
  const nodes = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    if (node.name) nodes.set(node.name, node);
  });
  return nodes;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findNode(
  nodes: NamedObjectMap,
  candidates: string[],
): THREE.Object3D | undefined {
  for (const candidate of candidates) {
    const exact = nodes.get(candidate);
    if (exact) return exact;
  }
  const normalized = candidates.map(normalizeName);
  for (const node of nodes.values()) {
    const nodeName = normalizeName(node.name);
    if (
      normalized.some(
        (candidate) => nodeName === candidate || nodeName.includes(candidate),
      )
    ) {
      return node;
    }
  }
  return undefined;
}

function eulerOffset(
  base: THREE.Quaternion,
  x: number,
  y: number,
  z: number,
): THREE.Quaternion {
  return base
    .clone()
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
}

function positionOffset(
  base: THREE.Vector3,
  x: number,
  y: number,
  z: number,
): THREE.Vector3 {
  return base.clone().add(new THREE.Vector3(x, y, z));
}

function quaternionTrack(
  node: THREE.Object3D | undefined,
  times: number[],
  quaternions: THREE.Quaternion[],
): THREE.QuaternionKeyframeTrack | null {
  if (!node) return null;
  return new THREE.QuaternionKeyframeTrack(
    `${node.uuid}.quaternion`,
    times,
    quaternions.flatMap((q) => [q.x, q.y, q.z, q.w]),
  );
}

function positionTrack(
  node: THREE.Object3D | undefined,
  times: number[],
  positions: THREE.Vector3[],
): THREE.VectorKeyframeTrack | null {
  if (!node) return null;
  return new THREE.VectorKeyframeTrack(
    `${node.uuid}.position`,
    times,
    positions.flatMap((p) => [p.x, p.y, p.z]),
  );
}

function compactTracks(
  tracks: Array<
    THREE.QuaternionKeyframeTrack | THREE.VectorKeyframeTrack | null | undefined
  >,
): THREE.KeyframeTrack[] {
  return tracks.filter((track): track is THREE.KeyframeTrack => Boolean(track));
}

function makeClip(
  name: HandAction,
  duration: number,
  tracks: THREE.KeyframeTrack[],
): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, tracks);
}

function curlFinger(
  node: THREE.Object3D | undefined,
  base: THREE.Quaternion,
  amount: number,
  times: number[],
): THREE.QuaternionKeyframeTrack | null {
  return quaternionTrack(node, times, [
    base,
    eulerOffset(base, amount, 0, 0),
    eulerOffset(base, amount * 0.72, 0, 0),
  ]);
}

export function createGeneratedOfficeActionClips(
  root: THREE.Object3D,
): THREE.AnimationClip[] {
  const nodes = collectNamedObjects(root);
  const rig = {
    root: findNode(nodes, ["Armature", "RootNode", "caucasian_male_1"]),
    leftControl: findNode(nodes, ["handLcontrol", "LeftHandControl"]),
    rightControl: findNode(nodes, ["handRcontrol", "RightHandControl"]),
    upperLeft: findNode(nodes, ["upper_armL", "UpperArm.L", "LeftUpperArm"]),
    lowerLeft: findNode(nodes, ["forearmL", "LowerArm.L", "LeftForeArm"]),
    handLeft: findNode(nodes, ["handL", "Hand.L", "HandL", "LeftHand"]),
    thumbLeft: findNode(nodes, ["thumb01L", "Thumb.L"]),
    indexLeft: findNode(nodes, ["f_index01L", "Index.L"]),
    middleLeft: findNode(nodes, ["f_middle01L", "Middle.L"]),
    ringLeft: findNode(nodes, ["f_ring01L", "Ring.L"]),
    pinkyLeft: findNode(nodes, ["f_pinky01L", "Pinky.L"]),
    upperRight: findNode(nodes, ["upper_armR", "UpperArm.R", "RightUpperArm"]),
    lowerRight: findNode(nodes, ["forearmR", "LowerArm.R", "RightForeArm"]),
    handRight: findNode(nodes, [
      "handR",
      "Hand.R",
      "HandR",
      "RightHand",
      "Hand.R.001",
    ]),
    thumbRight: findNode(nodes, ["thumb01R", "Thumb.R", "Thumb.R.001"]),
    indexRight: findNode(nodes, ["f_index01R", "Index.R", "Index.R.001"]),
    middleRight: findNode(nodes, ["f_middle01R", "Middle.R", "Middle.R.001"]),
    ringRight: findNode(nodes, ["f_ring01R", "Ring.R", "Ring.R.001"]),
    pinkyRight: findNode(nodes, ["f_pinky01R", "Pinky.R", "Pinky.R.001"]),
  };

  const base = Object.fromEntries(
    Object.entries(rig).map(([key, node]) => [
      key,
      {
        position: node?.position.clone() ?? new THREE.Vector3(),
        quaternion: node?.quaternion.clone() ?? new THREE.Quaternion(),
      },
    ]),
  ) as Record<
    keyof typeof rig,
    { position: THREE.Vector3; quaternion: THREE.Quaternion }
  >;

  const rightControlBase = base.rightControl.position;
  const leftControlBase = base.leftControl.position;

  const relaxedLeft = {
    upper: eulerOffset(base.upperLeft.quaternion, -0.2, 0.16, -0.38),
    lower: eulerOffset(base.lowerLeft.quaternion, -0.36, 0.06, -0.08),
    hand: eulerOffset(base.handLeft.quaternion, 0.06, -0.08, -0.04),
  };
  const relaxedRight = {
    upper: eulerOffset(base.upperRight.quaternion, -0.2, -0.16, 0.38),
    lower: eulerOffset(base.lowerRight.quaternion, -0.36, -0.06, 0.08),
    hand: eulerOffset(base.handRight.quaternion, 0.06, 0.08, 0.04),
  };

  const idleTimes = [0, 1.15, 2.3];
  const idle = makeClip(
    "idle",
    2.3,
    compactTracks([
      positionTrack(rig.root, idleTimes, [
        base.root.position,
        positionOffset(base.root.position, 0, 0.014, 0),
        base.root.position,
      ]),
      positionTrack(rig.leftControl, idleTimes, [
        positionOffset(leftControlBase, -0.02, -0.01, 0.02),
        positionOffset(leftControlBase, -0.026, -0.006, 0.018),
        positionOffset(leftControlBase, -0.02, -0.01, 0.02),
      ]),
      positionTrack(rig.rightControl, idleTimes, [
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
        positionOffset(rightControlBase, 0.026, -0.006, 0.018),
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
      ]),
      quaternionTrack(rig.upperLeft, idleTimes, [
        relaxedLeft.upper,
        eulerOffset(relaxedLeft.upper, 0.015, 0, 0.01),
        relaxedLeft.upper,
      ]),
      quaternionTrack(rig.lowerLeft, idleTimes, [
        relaxedLeft.lower,
        eulerOffset(relaxedLeft.lower, -0.015, 0, 0),
        relaxedLeft.lower,
      ]),
      quaternionTrack(rig.handLeft, idleTimes, [
        relaxedLeft.hand,
        relaxedLeft.hand,
        relaxedLeft.hand,
      ]),
      quaternionTrack(rig.upperRight, idleTimes, [
        relaxedRight.upper,
        eulerOffset(relaxedRight.upper, 0.015, 0, -0.01),
        relaxedRight.upper,
      ]),
      quaternionTrack(rig.lowerRight, idleTimes, [
        relaxedRight.lower,
        eulerOffset(relaxedRight.lower, -0.015, 0, 0),
        relaxedRight.lower,
      ]),
      quaternionTrack(rig.handRight, idleTimes, [
        relaxedRight.hand,
        relaxedRight.hand,
        relaxedRight.hand,
      ]),
    ]),
  );

  const walkTimes = [0, 0.28, 0.56];
  const walk = makeClip(
    "walk",
    0.56,
    compactTracks([
      positionTrack(rig.root, walkTimes, [
        positionOffset(base.root.position, -0.01, 0, 0),
        positionOffset(base.root.position, 0.01, 0.01, 0),
        positionOffset(base.root.position, -0.01, 0, 0),
      ]),
      positionTrack(rig.leftControl, walkTimes, [
        positionOffset(leftControlBase, -0.03, -0.02, 0.03),
        positionOffset(leftControlBase, -0.018, 0.005, -0.025),
        positionOffset(leftControlBase, -0.03, -0.02, 0.03),
      ]),
      positionTrack(rig.rightControl, walkTimes, [
        positionOffset(rightControlBase, 0.018, 0.005, -0.025),
        positionOffset(rightControlBase, 0.03, -0.02, 0.03),
        positionOffset(rightControlBase, 0.018, 0.005, -0.025),
      ]),
      quaternionTrack(rig.upperLeft, walkTimes, [
        eulerOffset(relaxedLeft.upper, 0.02, 0.04, -0.12),
        eulerOffset(relaxedLeft.upper, 0.12, 0.02, 0.04),
        eulerOffset(relaxedLeft.upper, 0.02, 0.04, -0.12),
      ]),
      quaternionTrack(rig.upperRight, walkTimes, [
        eulerOffset(relaxedRight.upper, 0.12, -0.02, -0.04),
        eulerOffset(relaxedRight.upper, 0.02, -0.04, 0.12),
        eulerOffset(relaxedRight.upper, 0.12, -0.02, -0.04),
      ]),
    ]),
  );

  const jump = makeClip(
    "jump",
    0.42,
    compactTracks([
      positionTrack(rig.root, [0, 0.16, 0.42], [
        base.root.position,
        positionOffset(base.root.position, 0, -0.045, 0.04),
        base.root.position,
      ]),
      quaternionTrack(rig.upperLeft, [0, 0.16, 0.42], [
        relaxedLeft.upper,
        eulerOffset(relaxedLeft.upper, -0.1, 0.08, -0.2),
        relaxedLeft.upper,
      ]),
      quaternionTrack(rig.upperRight, [0, 0.16, 0.42], [
        relaxedRight.upper,
        eulerOffset(relaxedRight.upper, -0.1, -0.08, 0.2),
        relaxedRight.upper,
      ]),
    ]),
  );

  const click = makeClip(
    "click",
    0.34,
    compactTracks([
      positionTrack(rig.rightControl, [0, 0.14, 0.24, 0.34], [
        positionOffset(rightControlBase, 0.03, -0.01, 0.02),
        positionOffset(rightControlBase, 0.08, 0.02, -0.3),
        positionOffset(rightControlBase, 0.1, 0.02, -0.38),
        positionOffset(rightControlBase, 0.03, -0.01, 0.02),
      ]),
      quaternionTrack(rig.upperRight, [0, 0.14, 0.34], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.62, -0.24, 0.12),
        relaxedRight.upper,
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.14, 0.34], [
        relaxedRight.lower,
        eulerOffset(base.lowerRight.quaternion, -0.72, -0.08, 0.04),
        relaxedRight.lower,
      ]),
      quaternionTrack(rig.handRight, [0, 0.14, 0.34], [
        relaxedRight.hand,
        eulerOffset(base.handRight.quaternion, -0.2, 0.08, 0.02),
        relaxedRight.hand,
      ]),
      quaternionTrack(rig.indexRight, [0, 0.14, 0.34], [
        base.indexRight.quaternion,
        eulerOffset(base.indexRight.quaternion, -0.28, 0, 0),
        base.indexRight.quaternion,
      ]),
    ]),
  );

  const reachMid = makeClip(
    "reach_mid",
    0.46,
    compactTracks([
      positionTrack(rig.rightControl, [0, 0.22, 0.46], [
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
        positionOffset(rightControlBase, 0.08, 0.03, -0.46),
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
      ]),
      quaternionTrack(rig.upperRight, [0, 0.22, 0.46], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.76, -0.18, 0.08),
        relaxedRight.upper,
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.22, 0.46], [
        relaxedRight.lower,
        eulerOffset(base.lowerRight.quaternion, -0.54, -0.04, 0.02),
        relaxedRight.lower,
      ]),
    ]),
  );

  const reachHigh = makeClip(
    "reach_high",
    0.52,
    compactTracks([
      positionTrack(rig.rightControl, [0, 0.24, 0.52], [
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
        positionOffset(rightControlBase, 0.08, 0.18, -0.42),
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
      ]),
      quaternionTrack(rig.upperRight, [0, 0.24, 0.52], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.92, -0.2, -0.1),
        relaxedRight.upper,
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.24, 0.52], [
        relaxedRight.lower,
        eulerOffset(base.lowerRight.quaternion, -0.4, -0.06, 0.02),
        relaxedRight.lower,
      ]),
    ]),
  );

  const pickupFloor = makeClip(
    "pickup_floor",
    0.72,
    compactTracks([
      positionTrack(rig.root, [0, 0.28, 0.48, 0.72], [
        base.root.position,
        positionOffset(base.root.position, 0, -0.09, 0.08),
        positionOffset(base.root.position, 0, -0.05, 0.04),
        base.root.position,
      ]),
      positionTrack(rig.rightControl, [0, 0.28, 0.48, 0.72], [
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
        positionOffset(rightControlBase, 0.12, -0.28, -0.34),
        positionOffset(rightControlBase, 0.08, -0.16, -0.18),
        positionOffset(rightControlBase, 0.02, -0.01, 0.02),
      ]),
      quaternionTrack(rig.upperRight, [0, 0.28, 0.72], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.46, -0.34, 0.2),
        relaxedRight.upper,
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.28, 0.72], [
        relaxedRight.lower,
        eulerOffset(base.lowerRight.quaternion, -0.92, -0.04, 0),
        relaxedRight.lower,
      ]),
      curlFinger(rig.indexRight, base.indexRight.quaternion, 0.52, [0, 0.28, 0.72]),
      curlFinger(rig.thumbRight, base.thumbRight.quaternion, -0.32, [0, 0.28, 0.72]),
    ]),
  );

  const grabShelf = makeClip(
    "grab_shelf",
    0.76,
    compactTracks([
      positionTrack(rig.leftControl, [0, 0.28, 0.52, 0.76], [
        positionOffset(leftControlBase, -0.03, -0.01, 0.02),
        positionOffset(leftControlBase, -0.06, 0.08, -0.34),
        positionOffset(leftControlBase, -0.06, 0.02, -0.2),
        positionOffset(leftControlBase, -0.03, -0.01, 0.02),
      ]),
      positionTrack(rig.rightControl, [0, 0.28, 0.52, 0.76], [
        positionOffset(rightControlBase, 0.03, -0.01, 0.02),
        positionOffset(rightControlBase, 0.08, 0.09, -0.42),
        positionOffset(rightControlBase, 0.06, 0.02, -0.22),
        positionOffset(rightControlBase, 0.03, -0.01, 0.02),
      ]),
      quaternionTrack(rig.upperLeft, [0, 0.28, 0.76], [
        relaxedLeft.upper,
        eulerOffset(base.upperLeft.quaternion, -0.72, 0.24, -0.08),
        relaxedLeft.upper,
      ]),
      quaternionTrack(rig.lowerLeft, [0, 0.28, 0.76], [
        relaxedLeft.lower,
        eulerOffset(base.lowerLeft.quaternion, -0.5, 0.04, -0.02),
        relaxedLeft.lower,
      ]),
      quaternionTrack(rig.upperRight, [0, 0.28, 0.76], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.72, -0.24, 0.08),
        relaxedRight.upper,
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.28, 0.76], [
        relaxedRight.lower,
        eulerOffset(base.lowerRight.quaternion, -0.5, -0.04, 0.02),
        relaxedRight.lower,
      ]),
      curlFinger(rig.indexRight, base.indexRight.quaternion, 0.44, [0, 0.28, 0.76]),
      curlFinger(rig.thumbRight, base.thumbRight.quaternion, -0.22, [0, 0.28, 0.76]),
    ]),
  );

  const holdOneHand = makeClip(
    "hold_one_hand",
    1.8,
    compactTracks([
      positionTrack(rig.rightControl, [0, 0.9, 1.8], [
        positionOffset(rightControlBase, 0.06, -0.02, -0.18),
        positionOffset(rightControlBase, 0.066, -0.01, -0.18),
        positionOffset(rightControlBase, 0.06, -0.02, -0.18),
      ]),
      quaternionTrack(rig.upperRight, [0, 0.9, 1.8], [
        eulerOffset(base.upperRight.quaternion, -0.48, -0.2, 0.14),
        eulerOffset(base.upperRight.quaternion, -0.5, -0.2, 0.13),
        eulerOffset(base.upperRight.quaternion, -0.48, -0.2, 0.14),
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.9, 1.8], [
        eulerOffset(base.lowerRight.quaternion, -0.72, -0.04, 0.02),
        eulerOffset(base.lowerRight.quaternion, -0.74, -0.04, 0.02),
        eulerOffset(base.lowerRight.quaternion, -0.72, -0.04, 0.02),
      ]),
      curlFinger(rig.indexRight, base.indexRight.quaternion, 0.48, [0, 0.9, 1.8]),
      curlFinger(rig.thumbRight, base.thumbRight.quaternion, -0.28, [0, 0.9, 1.8]),
    ]),
  );

  const holdTwoHand = makeClip(
    "hold_two_hand",
    1.8,
    compactTracks([
      positionTrack(rig.leftControl, [0, 0.9, 1.8], [
        positionOffset(leftControlBase, -0.07, -0.02, -0.2),
        positionOffset(leftControlBase, -0.076, -0.01, -0.2),
        positionOffset(leftControlBase, -0.07, -0.02, -0.2),
      ]),
      positionTrack(rig.rightControl, [0, 0.9, 1.8], [
        positionOffset(rightControlBase, 0.07, -0.02, -0.2),
        positionOffset(rightControlBase, 0.076, -0.01, -0.2),
        positionOffset(rightControlBase, 0.07, -0.02, -0.2),
      ]),
      quaternionTrack(rig.upperLeft, [0, 0.9, 1.8], [
        eulerOffset(base.upperLeft.quaternion, -0.54, 0.2, -0.14),
        eulerOffset(base.upperLeft.quaternion, -0.56, 0.2, -0.14),
        eulerOffset(base.upperLeft.quaternion, -0.54, 0.2, -0.14),
      ]),
      quaternionTrack(rig.lowerLeft, [0, 0.9, 1.8], [
        eulerOffset(base.lowerLeft.quaternion, -0.72, 0.04, -0.02),
        eulerOffset(base.lowerLeft.quaternion, -0.74, 0.04, -0.02),
        eulerOffset(base.lowerLeft.quaternion, -0.72, 0.04, -0.02),
      ]),
      quaternionTrack(rig.upperRight, [0, 0.9, 1.8], [
        eulerOffset(base.upperRight.quaternion, -0.54, -0.2, 0.14),
        eulerOffset(base.upperRight.quaternion, -0.56, -0.2, 0.14),
        eulerOffset(base.upperRight.quaternion, -0.54, -0.2, 0.14),
      ]),
      quaternionTrack(rig.lowerRight, [0, 0.9, 1.8], [
        eulerOffset(base.lowerRight.quaternion, -0.72, -0.04, 0.02),
        eulerOffset(base.lowerRight.quaternion, -0.74, -0.04, 0.02),
        eulerOffset(base.lowerRight.quaternion, -0.72, -0.04, 0.02),
      ]),
    ]),
  );

  const putAway = makeClip(
    "put_away",
    0.44,
    compactTracks([
      positionTrack(rig.root, [0, 0.2, 0.44], [
        base.root.position,
        positionOffset(base.root.position, 0, -0.07, 0.1),
        base.root.position,
      ]),
      quaternionTrack(rig.upperLeft, [0, 0.2, 0.44], [
        relaxedLeft.upper,
        eulerOffset(base.upperLeft.quaternion, -0.08, 0.1, -0.32),
        relaxedLeft.upper,
      ]),
      quaternionTrack(rig.upperRight, [0, 0.2, 0.44], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.08, -0.1, 0.32),
        relaxedRight.upper,
      ]),
    ]),
  );

  const inspect = makeClip(
    "inspect",
    1.2,
    compactTracks([
      positionTrack(rig.leftControl, [0, 0.45, 1.2], [
        positionOffset(leftControlBase, -0.04, -0.02, -0.16),
        positionOffset(leftControlBase, -0.08, 0.06, -0.34),
        positionOffset(leftControlBase, -0.04, -0.02, -0.16),
      ]),
      positionTrack(rig.rightControl, [0, 0.45, 1.2], [
        positionOffset(rightControlBase, 0.04, -0.02, -0.16),
        positionOffset(rightControlBase, 0.08, 0.06, -0.34),
        positionOffset(rightControlBase, 0.04, -0.02, -0.16),
      ]),
      quaternionTrack(rig.upperLeft, [0, 0.45, 1.2], [
        relaxedLeft.upper,
        eulerOffset(base.upperLeft.quaternion, -0.58, 0.2, -0.08),
        relaxedLeft.upper,
      ]),
      quaternionTrack(rig.upperRight, [0, 0.45, 1.2], [
        relaxedRight.upper,
        eulerOffset(base.upperRight.quaternion, -0.58, -0.2, 0.08),
        relaxedRight.upper,
      ]),
    ]),
  );

  const clips: Partial<Record<HandAction, THREE.AnimationClip>> = {
    idle,
    walk,
    jump,
    click,
    reach_mid: reachMid,
    reach_high: reachHigh,
    pickup_floor: pickupFloor,
    grab_shelf: grabShelf,
    hold_one_hand: holdOneHand,
    hold_two_hand: holdTwoHand,
    put_away: putAway,
    inspect,
    reach: reachMid.clone(),
    grab: grabShelf.clone(),
    press: click.clone(),
    point: reachMid.clone(),
    holdItem: holdTwoHand.clone(),
    putAway: putAway.clone(),
  };

  clips.reach!.name = "reach";
  clips.grab!.name = "grab";
  clips.press!.name = "press";
  clips.point!.name = "point";
  clips.holdItem!.name = "holdItem";
  clips.putAway!.name = "putAway";

  return OFFICE_ACTIONS.map((action) => clips[action]).filter(
    (clip): clip is THREE.AnimationClip => Boolean(clip),
  );
}
