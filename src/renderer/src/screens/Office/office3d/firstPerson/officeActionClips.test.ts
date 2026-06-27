import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createGeneratedOfficeActionClips } from "./officeActionClips";
import type { HandAction } from "./types";

const REQUIRED_SEMANTIC_ACTIONS: HandAction[] = [
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
];

function namedObject(name: string): THREE.Object3D {
  const object = new THREE.Object3D();
  object.name = name;
  return object;
}

function makeRigRoot(): THREE.Object3D {
  const root = namedObject("Armature");
  [
    "handLcontrol",
    "handRcontrol",
    "upper_armL",
    "forearmL",
    "handL",
    "thumb01L",
    "f_index01L",
    "f_middle01L",
    "f_ring01L",
    "f_pinky01L",
    "upper_armR",
    "forearmR",
    "handR",
    "thumb01R",
    "f_index01R",
    "f_middle01R",
    "f_ring01R",
    "f_pinky01R",
  ].forEach((name) => root.add(namedObject(name)));
  return root;
}

describe("generated first-person office action clips", () => {
  it("creates a distinct clip for every v2 semantic hand action", () => {
    const clips = createGeneratedOfficeActionClips(makeRigRoot());
    const clipNames = new Set(clips.map((clip) => clip.name));

    REQUIRED_SEMANTIC_ACTIONS.forEach((action) => {
      expect(clipNames.has(action), action).toBe(true);
    });
  });
});
