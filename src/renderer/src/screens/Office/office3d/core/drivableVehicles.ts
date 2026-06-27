import * as THREE from "three";
import { ROAD_SOUTH_Z, ROAD_WIDTH } from "./cityPlan";

export interface DrivableVehicleDefinition {
  id: string;
  label: string;
  position: [number, number, number];
  yaw: number;
  tint: string;
  targetLen: number;
  collisionRadius: number;
  exitOffsets: Array<[number, number]>;
}

export interface DrivableVehiclePose extends DrivableVehicleDefinition {
  position: [number, number, number];
  yaw: number;
}

export const VEHICLE_DRIVE_SPEED = 10.8;
export const VEHICLE_REVERSE_SPEED = 4.9;
export const VEHICLE_BOOST_MULTIPLIER = 1.6;
export const VEHICLE_TURN_SPEED = 2.05;

const SOUTH_PARKING_GAP_FROM_ROAD = 2.2;
const SOUTH_PARKING_D = 11.4;
const SOUTH_PARKING_CENTRE_Z =
  ROAD_SOUTH_Z + ROAD_WIDTH / 2 + SOUTH_PARKING_GAP_FROM_ROAD + SOUTH_PARKING_D / 2;
const SOUTH_PARKING_MIN_Z = SOUTH_PARKING_CENTRE_Z - SOUTH_PARKING_D / 2;
const SOUTH_PARKING_NORTH_ROW_Z = SOUTH_PARKING_MIN_Z + 2.35;

export const DRIVABLE_PARKED_CAR: DrivableVehicleDefinition = {
  id: "south-parking-sports-car",
  label: "\u8dd1\u8f66",
  position: [-8.4, 0.018, SOUTH_PARKING_NORTH_ROW_Z + 1.82],
  yaw: 0,
  tint: "#e53935",
  targetLen: 2.3,
  collisionRadius: 0.95,
  exitOffsets: [
    [-1.72, 0.25],
    [1.72, 0.25],
    [0, 2.15],
    [0, -2.15],
  ],
};

export function createVehiclePose(
  vehicle: DrivableVehicleDefinition,
): DrivableVehiclePose {
  return {
    ...vehicle,
    position: [...vehicle.position],
  };
}

export function computeVehicleChaseCameraPose({
  vehicle,
  cameraPosition,
  cameraTarget,
  cameraYawOffset = 0,
  pitch = 0,
}: {
  vehicle: DrivableVehicleDefinition | DrivableVehiclePose;
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraYawOffset?: number;
  pitch?: number;
}): void {
  const [x, , z] = vehicle.position;
  const cameraYaw = vehicle.yaw + cameraYawOffset;
  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const cameraHeight = THREE.MathUtils.clamp(2.55 + pitch * 0.9, 1.65, 3.45);
  cameraPosition.set(x - forwardX * 4.8, 2.65, z - forwardZ * 4.8);
  cameraPosition.y = cameraHeight;
  cameraTarget.set(x, 0.82, z);
}

export function resolveVehicleExitPosition(
  vehicle: DrivableVehicleDefinition | DrivableVehiclePose,
  isWalkable: (x: number, z: number) => boolean,
): THREE.Vector3 | null {
  const [x, y, z] = vehicle.position;
  const forward = new THREE.Vector2(-Math.sin(vehicle.yaw), -Math.cos(vehicle.yaw));
  const right = new THREE.Vector2(forward.y * -1, forward.x);

  for (const [sideOffset, forwardOffset] of vehicle.exitOffsets) {
    const exitX = x + right.x * sideOffset + forward.x * forwardOffset;
    const exitZ = z + right.y * sideOffset + forward.y * forwardOffset;
    if (isWalkable(exitX, exitZ)) {
      return new THREE.Vector3(exitX, y, exitZ);
    }
  }

  return null;
}

export function resolveVehicleDrivePose({
  vehicle,
  forwardInput,
  turnInput,
  delta,
  canOccupy,
  speedMultiplier = 1,
}: {
  vehicle: DrivableVehiclePose;
  forwardInput: number;
  turnInput: number;
  delta: number;
  canOccupy?: (x: number, z: number) => boolean;
  speedMultiplier?: number;
}): DrivableVehiclePose {
  const step = Math.min(delta, 1 / 30);
  const nextYaw =
    vehicle.yaw +
    THREE.MathUtils.clamp(turnInput, -1, 1) * VEHICLE_TURN_SPEED * step;
  const driveInput = THREE.MathUtils.clamp(forwardInput, -1, 1);
  const speed = driveInput >= 0 ? VEHICLE_DRIVE_SPEED : VEHICLE_REVERSE_SPEED;
  const distance =
    driveInput *
    speed *
    THREE.MathUtils.clamp(speedMultiplier, 0.1, VEHICLE_BOOST_MULTIPLIER) *
    step;
  const [x, y, z] = vehicle.position;
  const nextX = x + -Math.sin(nextYaw) * distance;
  const nextZ = z + -Math.cos(nextYaw) * distance;

  if (canOccupy && distance !== 0 && !canOccupy(nextX, nextZ)) {
    return {
      ...vehicle,
      yaw: nextYaw,
      position: [...vehicle.position],
    };
  }

  return {
    ...vehicle,
    yaw: nextYaw,
    position: [nextX, y, nextZ],
  };
}
