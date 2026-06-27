import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  computeThirdPersonCameraPose,
  findWorkstationScreenHit,
  FPS_START,
  isDynamicColliderBlockingMove,
  isSprintKeyDown,
  readInteractData,
  resolveFirstPersonEyeY,
  resolveFirstPersonMovementIntent,
  WORKSTATION_SCREEN_INTERACT_DISTANCE,
} from "./FirstPersonController";
import {
  DRIVABLE_PARKED_CAR,
  VEHICLE_BOOST_MULTIPLIER,
  computeVehicleChaseCameraPose,
  createVehiclePose,
  resolveVehicleDrivePose,
  resolveVehicleExitPosition,
} from "../core/drivableVehicles";

function hit(
  object: THREE.Object3D,
  distance: number,
): THREE.Intersection<THREE.Object3D> {
  return {
    object,
    distance,
    point: new THREE.Vector3(),
    face: null,
    faceIndex: null,
    uv: new THREE.Vector2(),
  };
}

describe("first-person scene interactions", () => {
  it("reads interaction data from parent objects", () => {
    const parent = new THREE.Object3D();
    const child = new THREE.Object3D();
    const interact = vi.fn();
    parent.userData.aimashiInteract = interact;
    parent.userData.aimashiInteractionKind = "workstation-screen";
    parent.userData.aimashiInteractionProfile = {
      kind: "screen",
      action: "click",
      label: "任务屏幕",
    };
    parent.add(child);

    expect(readInteractData(child)).toMatchObject({
      interact,
      interactionKind: "workstation-screen",
      profile: {
        kind: "screen",
        action: "click",
        label: "任务屏幕",
      },
    });
  });

  it("reads drivable vehicle data from parent objects", () => {
    const parent = new THREE.Object3D();
    const child = new THREE.Object3D();
    parent.userData.aimashiDrivableVehicle = DRIVABLE_PARKED_CAR;
    parent.add(child);

    expect(readInteractData(child)).toMatchObject({
      drivableVehicle: {
        id: DRIVABLE_PARKED_CAR.id,
        label: "跑车",
        tint: "#e53935",
      },
    });
  });

  it("selects workstation screens only inside interaction distance", () => {
    const nearScreen = new THREE.Object3D();
    nearScreen.userData.aimashiInteract = vi.fn();
    nearScreen.userData.aimashiInteractionKind = "workstation-screen";

    const farScreen = new THREE.Object3D();
    farScreen.userData.aimashiInteract = vi.fn();
    farScreen.userData.aimashiInteractionKind = "workstation-screen";

    expect(
      findWorkstationScreenHit([
        hit(farScreen, WORKSTATION_SCREEN_INTERACT_DISTANCE + 0.01),
        hit(nearScreen, WORKSTATION_SCREEN_INTERACT_DISTANCE),
      ])?.object,
    ).toBe(nearScreen);
    expect(
      findWorkstationScreenHit([
        hit(farScreen, WORKSTATION_SCREEN_INTERACT_DISTANCE + 0.01),
      ]),
    ).toBeUndefined();
  });

  it("publishes sprint intent from either shift key", () => {
    expect(isSprintKeyDown({ ShiftLeft: true })).toBe(true);
    expect(isSprintKeyDown({ ShiftRight: true })).toBe(true);
    expect(isSprintKeyDown({ KeyW: true })).toBe(false);
  });

  it("resolves explicit player locomotion intent for walk and run", () => {
    expect(
      resolveFirstPersonMovementIntent({ moving: false, sprinting: true }),
    ).toBe("idle");
    expect(
      resolveFirstPersonMovementIntent({ moving: true, sprinting: false }),
    ).toBe("walk");
    expect(
      resolveFirstPersonMovementIntent({ moving: true, sprinting: true }),
    ).toBe("run");
  });

  it("keeps first-person eye calibration small and separate from player start height", () => {
    const eyeY = resolveFirstPersonEyeY();

    expect(eyeY).toBeLessThan(FPS_START[1]);
    expect(FPS_START[1] - eyeY).toBeGreaterThan(0);
    expect(FPS_START[1] - eyeY).toBeLessThanOrEqual(0.05);
    expect(resolveFirstPersonEyeY(0.25)).toBeCloseTo(eyeY + 0.25);
  });

  it("lowers the third-person camera target when looking down", () => {
    const playerPosition = new THREE.Vector3(0, FPS_START[1], 0);
    const levelCamera = new THREE.Vector3();
    const levelTarget = new THREE.Vector3();
    const downCamera = new THREE.Vector3();
    const downTarget = new THREE.Vector3();

    computeThirdPersonCameraPose({
      playerPosition,
      yaw: 0,
      pitch: 0,
      eyeY: FPS_START[1],
      cameraPosition: levelCamera,
      cameraTarget: levelTarget,
    });
    computeThirdPersonCameraPose({
      playerPosition,
      yaw: 0,
      pitch: -0.9,
      eyeY: FPS_START[1],
      cameraPosition: downCamera,
      cameraTarget: downTarget,
    });

    expect(levelCamera.y).toBeGreaterThan(FPS_START[1]);
    expect(levelTarget.y).toBeLessThan(FPS_START[1] + 0.4);
    expect(downTarget.y).toBeLessThan(levelTarget.y);
    expect(downTarget.y).toBeLessThan(0.24);
  });

  it("places the driving camera behind the parked sports car", () => {
    const cameraPosition = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();

    computeVehicleChaseCameraPose({
      vehicle: DRIVABLE_PARKED_CAR,
      cameraPosition,
      cameraTarget,
    });

    expect(cameraPosition.y).toBeGreaterThan(2);
    expect(cameraPosition.z).toBeGreaterThan(DRIVABLE_PARKED_CAR.position[2]);
    expect(cameraTarget.x).toBeCloseTo(DRIVABLE_PARKED_CAR.position[0]);
    expect(cameraTarget.z).toBeCloseTo(DRIVABLE_PARKED_CAR.position[2]);
  });

  it("falls back to the first walkable vehicle exit point", () => {
    const exit = resolveVehicleExitPosition(DRIVABLE_PARKED_CAR, (x) => {
      return x > DRIVABLE_PARKED_CAR.position[0];
    });

    expect(exit).toBeTruthy();
    expect(exit!.x).toBeGreaterThan(DRIVABLE_PARKED_CAR.position[0]);
  });

  it("keeps the player in the vehicle when every exit point is blocked", () => {
    expect(resolveVehicleExitPosition(DRIVABLE_PARKED_CAR, () => false)).toBeNull();
  });

  it("moves the drivable vehicle forward at a responsive city speed", () => {
    const pose = createVehiclePose(DRIVABLE_PARKED_CAR);

    const moved = resolveVehicleDrivePose({
      vehicle: pose,
      forwardInput: 1,
      turnInput: 0,
      delta: 1,
    });

    expect(moved.position[2]).toBeLessThan(pose.position[2]);
    expect(pose.position[2] - moved.position[2]).toBeGreaterThan(0.32);
    expect(pose.position[2] - moved.position[2]).toBeLessThan(0.42);
  });

  it("boosts the drivable vehicle speed when sprint input is active", () => {
    const pose = createVehiclePose(DRIVABLE_PARKED_CAR);

    const normal = resolveVehicleDrivePose({
      vehicle: pose,
      forwardInput: 1,
      turnInput: 0,
      delta: 1,
    });
    const boosted = resolveVehicleDrivePose({
      vehicle: pose,
      forwardInput: 1,
      turnInput: 0,
      delta: 1,
      speedMultiplier: VEHICLE_BOOST_MULTIPLIER,
    });

    const normalDistance = pose.position[2] - normal.position[2];
    const boostedDistance = pose.position[2] - boosted.position[2];
    expect(boostedDistance).toBeGreaterThan(normalDistance);
    expect(boostedDistance).toBeCloseTo(
      normalDistance * VEHICLE_BOOST_MULTIPLIER,
    );
  });

  it("turns the drivable vehicle without moving through blocked space", () => {
    const pose = createVehiclePose(DRIVABLE_PARKED_CAR);

    const moved = resolveVehicleDrivePose({
      vehicle: pose,
      forwardInput: 1,
      turnInput: 1,
      delta: 1,
      canOccupy: () => false,
    });

    expect(moved.yaw).toBeGreaterThan(pose.yaw);
    expect(moved.position).toEqual(pose.position);
  });

  it("lets vehicle collision checks ignore the controlled car but block people", () => {
    const scene = new THREE.Scene();
    const controlledCar = new THREE.Object3D();
    controlledCar.position.set(0, 0, -0.1);
    controlledCar.userData.aimashiCollisionRadius = 0.95;
    controlledCar.userData.aimashiDrivableVehicle = DRIVABLE_PARKED_CAR;
    scene.add(controlledCar);

    const person = new THREE.Object3D();
    person.position.set(0, 0, -1.2);
    person.userData.aimashiCollisionRadius = 0.38;
    scene.add(person);

    const current = new THREE.Vector3(0, 0, 0);
    expect(
      isDynamicColliderBlockingMove(
        scene,
        current,
        new THREE.Vector3(0, 0, -0.1),
        0.68,
        { ignoredDrivableVehicleId: DRIVABLE_PARKED_CAR.id },
      ),
    ).toBe(false);
    expect(
      isDynamicColliderBlockingMove(
        scene,
        current,
        new THREE.Vector3(0, 0, -1.2),
        0.68,
        { ignoredDrivableVehicleId: DRIVABLE_PARKED_CAR.id },
      ),
    ).toBe(true);
  });
});
