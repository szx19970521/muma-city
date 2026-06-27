import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  isFirstPersonWorldWalkable,
  resolveFirstPersonMove,
} from "../core/navigationCollision";
import {
  VEHICLE_BOOST_MULTIPLIER,
  computeVehicleChaseCameraPose,
  createVehiclePose,
  resolveVehicleDrivePose,
  resolveVehicleExitPosition,
  type DrivableVehicleDefinition,
  type DrivableVehiclePose,
} from "../core/drivableVehicles";
import {
  actionForHeldItem,
  actionForInteraction,
  HELD_ITEM_KEYS,
  interactionHintFor,
  labelForHeldItem,
} from "./interactionMapping";
import type {
  FirstPersonHudState,
  FirstPersonInteractionProfile,
  FirstPersonMotionState,
  FirstPersonPlayerPose,
  FirstPersonViewMode,
  HandAction,
  HeldItemKind,
} from "./types";

export const FPS_START: [number, number, number] = [0, 1.52, 5.8];
const FPS_LOOK_AT: [number, number, number] = [-2.2, 1.35, -8.4];
const FIRST_PERSON_EYE_HEIGHT_OFFSET = -0.035;
const AGENT_INTERACT_DISTANCE = 4.5;
export const WORKSTATION_SCREEN_INTERACT_DISTANCE = 4.5;
const GENERIC_INTERACT_DISTANCE = 4.8;
const FIRST_PERSON_COLLISION_RADIUS = 0.42;
const JUMP_SPEED = 4.9;
const JUMP_GRAVITY = -13.5;
const MAX_JUMP_OFFSET = 0.82;
const WALK_MOVE_SPEED = 3.15;
const SPRINT_MOVE_SPEED = 4.85;
const THIRD_PERSON_DISTANCE = 3.15;
const THIRD_PERSON_CAMERA_HEIGHT = 0.58;
const THIRD_PERSON_TARGET_HEIGHT = 0.1;
const THIRD_PERSON_PITCH_TARGET_FACTOR = 1.55;
const THIRD_PERSON_MIN_TARGET_HEIGHT = 0.04;
const THIRD_PERSON_MAX_TARGET_ABOVE_EYE = 0.92;

export function isSprintKeyDown(keys: Record<string, boolean>): boolean {
  return Boolean(keys.ShiftLeft || keys.ShiftRight);
}

export function resolveFirstPersonMovementIntent({
  moving,
  sprinting,
}: {
  moving: boolean;
  sprinting: boolean;
}): "idle" | "walk" | "run" {
  if (!moving) return "idle";
  return sprinting ? "run" : "walk";
}

export function resolveFirstPersonEyeY(verticalOffset = 0): number {
  return FPS_START[1] + FIRST_PERSON_EYE_HEIGHT_OFFSET + verticalOffset;
}

export function computeThirdPersonCameraPose({
  playerPosition,
  yaw,
  pitch,
  eyeY,
  cameraPosition,
  cameraTarget,
}: {
  playerPosition: THREE.Vector3;
  yaw: number;
  pitch: number;
  eyeY: number;
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
}): void {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const groundY = eyeY - FPS_START[1];
  const targetY = THREE.MathUtils.clamp(
    eyeY + THIRD_PERSON_TARGET_HEIGHT + pitch * THIRD_PERSON_PITCH_TARGET_FACTOR,
    groundY + THIRD_PERSON_MIN_TARGET_HEIGHT,
    eyeY + THIRD_PERSON_MAX_TARGET_ABOVE_EYE,
  );
  cameraPosition.set(
    playerPosition.x - forwardX * THIRD_PERSON_DISTANCE,
    eyeY + THIRD_PERSON_CAMERA_HEIGHT,
    playerPosition.z - forwardZ * THIRD_PERSON_DISTANCE,
  );
  cameraTarget.set(playerPosition.x, targetY, playerPosition.z);
}

function isVisibleInHierarchy(node: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function hasAncestorDrivableVehicleId(
  node: THREE.Object3D,
  vehicleId: string,
): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    const drivableVehicle = current.userData
      .aimashiDrivableVehicle as DrivableVehicleDefinition | undefined;
    if (drivableVehicle?.id === vehicleId) return true;
    current = current.parent;
  }
  return false;
}

export function isDynamicColliderBlockingMove(
  scene: THREE.Scene,
  current: THREE.Vector3,
  desired: THREE.Vector3,
  playerRadius = FIRST_PERSON_COLLISION_RADIUS,
  options: { ignoredDrivableVehicleId?: string } = {},
): boolean {
  const desiredPoint = new THREE.Vector3(desired.x, 0, desired.z);
  const currentPoint = new THREE.Vector3(current.x, 0, current.z);
  const colliderPosition = new THREE.Vector3();
  let blocked = false;

  scene.traverse((node) => {
    if (blocked) return;
    if (!isVisibleInHierarchy(node)) return;
    if (
      options.ignoredDrivableVehicleId &&
      hasAncestorDrivableVehicleId(node, options.ignoredDrivableVehicleId)
    ) {
      return;
    }
    const radius = node.userData.aimashiCollisionRadius as number | undefined;
    if (!radius || radius <= 0) return;
    node.getWorldPosition(colliderPosition);
    colliderPosition.y = 0;
    const minDistance = radius + playerRadius;
    const desiredDistance = desiredPoint.distanceTo(colliderPosition);
    if (desiredDistance >= minDistance) return;

    const currentDistance = currentPoint.distanceTo(colliderPosition);
    if (currentDistance < minDistance && desiredDistance >= currentDistance) {
      return;
    }
    blocked = true;
  });

  return blocked;
}

function resolveDynamicFirstPersonMove(
  scene: THREE.Scene,
  current: THREE.Vector3,
  desired: THREE.Vector3,
): THREE.Vector3 {
  const direct = resolveDynamicFirstPersonMoveSegment(scene, current, desired);
  if (direct.distanceTo(desired) <= 0.0001) return direct;

  const slideX = current.clone();
  slideX.x = desired.x;
  const resolvedX = resolveDynamicFirstPersonMoveSegment(scene, current, slideX);
  if (resolvedX.distanceTo(slideX) <= 0.0001) return resolvedX;

  const slideZ = current.clone();
  slideZ.z = desired.z;
  const resolvedZ = resolveDynamicFirstPersonMoveSegment(scene, current, slideZ);
  if (resolvedZ.distanceTo(slideZ) <= 0.0001) return resolvedZ;

  return direct.distanceTo(current) > 0.0001 ? direct : current.clone();
}

function resolveDynamicFirstPersonMoveSegment(
  scene: THREE.Scene,
  current: THREE.Vector3,
  desired: THREE.Vector3,
): THREE.Vector3 {
  const dx = desired.x - current.x;
  const dz = desired.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.0001) {
    return isDynamicColliderBlockingMove(scene, current, desired)
      ? current.clone()
      : desired.clone();
  }

  const steps = Math.max(
    1,
    Math.ceil(distance / Math.max(FIRST_PERSON_COLLISION_RADIUS * 0.45, 0.16)),
  );
  let lastFree = current.clone();
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const candidate = desired.clone();
    candidate.x = current.x + dx * t;
    candidate.z = current.z + dz * t;
    if (isDynamicColliderBlockingMove(scene, current, candidate)) {
      return lastFree;
    }
    lastFree = candidate;
  }
  return desired.clone();
}

export function readInteractData(node: THREE.Object3D): {
  interact?: () => void;
  heldItem?: HeldItemKind;
  agentId?: string;
  interactionKind?: string;
  profile?: FirstPersonInteractionProfile;
  drivableVehicle?: DrivableVehicleDefinition;
} {
  let current: THREE.Object3D | null = node;
  while (current) {
    const interact = current.userData.aimashiInteract as (() => void) | undefined;
    const heldItem = current.userData.aimashiHeldItem as HeldItemKind | undefined;
    const agentId = current.userData.aimashiAgentId as string | undefined;
    const interactionKind = current.userData.aimashiInteractionKind as
      | string
      | undefined;
    const profile = current.userData
      .aimashiInteractionProfile as FirstPersonInteractionProfile | undefined;
    const drivableVehicle = current.userData
      .aimashiDrivableVehicle as DrivableVehicleDefinition | undefined;
    if (
      interact ||
      heldItem ||
      agentId ||
      interactionKind ||
      profile ||
      drivableVehicle
    ) {
      return {
        interact,
        heldItem,
        agentId,
        interactionKind,
        profile,
        drivableVehicle,
      };
    }
    current = current.parent;
  }
  return {};
}

export function findWorkstationScreenHit(
  hits: THREE.Intersection<THREE.Object3D>[],
): THREE.Intersection<THREE.Object3D> | undefined {
  return hits.find((hit) => {
    if (hit.distance > WORKSTATION_SCREEN_INTERACT_DISTANCE) return false;
    const data = readInteractData(hit.object);
    return (
      data.interactionKind === "workstation-screen" &&
      (data.interact || data.heldItem || data.profile)
    );
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

function restingActionFor(item: HeldItemKind): HandAction {
  return item === "none" ? "idle" : actionForHeldItem(item);
}

function runInteractionCandidate({
  interact,
  heldItem,
  interactionKind,
  profile,
  currentHeldItem,
  gl,
  onAction,
  onHeldItemChange,
  onHudStateChange,
}: {
  interact?: () => void;
  heldItem?: HeldItemKind;
  interactionKind?: string;
  profile?: FirstPersonInteractionProfile;
  currentHeldItem: HeldItemKind;
  gl: { domElement: HTMLCanvasElement };
  onAction: (action: HandAction, item?: HeldItemKind) => void;
  onHeldItemChange: (item: HeldItemKind) => void;
  onHudStateChange?: (patch: Partial<FirstPersonHudState>) => void;
}): { handled: boolean; heldItem: HeldItemKind; action: HandAction } {
  const preservesHeldItem =
    interactionKind === "workstation-screen" || profile?.kind === "screen";
  const mapped = actionForInteraction({
    heldItem: preservesHeldItem ? currentHeldItem : heldItem ?? currentHeldItem,
    interactionKind,
    profile,
  });
  if (!preservesHeldItem && (heldItem || profile?.heldItem)) {
    onHeldItemChange(mapped.heldItem);
  }
  onHudStateChange?.({
    heldItem: mapped.heldItem,
    lastAction: mapped.action,
    focusedTarget: profile?.label ?? interactionKind,
    interactionHint: interactionHintFor({
      heldItem: mapped.heldItem,
      profile,
      interactionKind,
    }),
    interactionHintMode: "target",
  });
  onAction(mapped.action, mapped.heldItem);
  if (interact) {
    if (document.pointerLockElement === gl.domElement) {
      void document.exitPointerLock();
    }
    interact();
    return { handled: true, ...mapped };
  }
  return { handled: false, ...mapped };
}

export function FirstPersonController({
  inputEnabled = true,
  onAction,
  onHeldItemChange,
  onMotionChange,
  onSceneMissed,
  onHudStateChange,
  selectedItemRequest,
  viewMode = "firstPerson",
  onViewModeChange,
  playerPoseRef,
}: {
  inputEnabled?: boolean;
  onAction: (action: HandAction, item?: HeldItemKind) => void;
  onHeldItemChange: (item: HeldItemKind) => void;
  onMotionChange: (state: FirstPersonMotionState) => void;
  onSceneMissed?: () => void;
  onHudStateChange?: (patch: Partial<FirstPersonHudState>) => void;
  selectedItemRequest?: { item: HeldItemKind; tick: number };
  viewMode?: FirstPersonViewMode;
  onViewModeChange?: (mode: FirstPersonViewMode) => void;
  playerPoseRef?: MutableRefObject<FirstPersonPlayerPose>;
}): React.JSX.Element {
  const { camera, gl, scene } = useThree();
  const keysRef = useRef<Record<string, boolean>>({});
  const inputEnabledRef = useRef(inputEnabled);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const lastMovingRef = useRef(false);
  const jumpingRef = useRef(false);
  const jumpVelocityRef = useRef(0);
  const jumpOffsetRef = useRef(0);
  const viewModeRef = useRef<FirstPersonViewMode>(viewMode);
  const previousViewModeRef = useRef<FirstPersonViewMode>("firstPerson");
  const drivingVehicleRef = useRef<DrivableVehiclePose | null>(null);
  const drivingCameraYawOffsetRef = useRef(0);
  const playerPositionRef = useRef(new THREE.Vector3(...FPS_START));
  const lastHeldItemRef = useRef<HeldItemKind>("none");
  const inventoryOpenRef = useRef(false);
  const statusOpenRef = useRef(false);
  const lastSelectionTickRef = useRef(-1);
  const hudRaycastTimeRef = useRef(0);
  const rotateByMouseRef = useRef<(movementX: number, movementY: number) => void>(
    () => undefined,
  );
  const runCenterInteractionRef = useRef<() => boolean>(() => false);
  const lastSprintingRef = useRef(false);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const move = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(...FPS_LOOK_AT), []);
  const thirdPersonCameraPosition = useMemo(() => new THREE.Vector3(), []);
  const thirdPersonCameraTarget = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const screenCenter = useMemo(() => new THREE.Vector2(0, 0), []);

  const readCenterCandidate = useCallback(():
    | {
        data: ReturnType<typeof readInteractData>;
        interactionKind?: string;
        profile?: FirstPersonInteractionProfile;
      }
    | undefined => {
    raycaster.setFromCamera(screenCenter, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    const screenHit = findWorkstationScreenHit(hits);
    if (screenHit) {
      const data = readInteractData(screenHit.object);
      return {
        data,
        interactionKind: data.interactionKind,
        profile: data.profile,
      };
    }

    for (const hit of hits) {
      if (hit.distance > GENERIC_INTERACT_DISTANCE) continue;
      const data = readInteractData(hit.object);
      if (!data.interact && !data.heldItem && !data.profile) continue;
      if (
        data.agentId &&
        data.interactionKind !== "workstation-screen" &&
        hit.distance > AGENT_INTERACT_DISTANCE
      ) {
        continue;
      }
      return {
        data,
        interactionKind: data.interactionKind,
        profile: data.profile,
      };
    }
    return undefined;
  }, [camera, raycaster, scene, screenCenter]);

  const publishMotion = useCallback(
    (moving: boolean): void => {
      const keys = keysRef.current;
      const motion: FirstPersonMotionState = {
        moving,
        pitch: pitchRef.current,
        sprinting: isSprintKeyDown(keys),
        jumping: jumpingRef.current,
        verticalOffset: jumpOffsetRef.current,
      };
      onMotionChange(motion);
      onHudStateChange?.({ motion });
    },
    [onHudStateChange, onMotionChange],
  );

  const publishHeldItem = useCallback(
    (item: HeldItemKind): void => {
      lastHeldItemRef.current = item;
      onHeldItemChange(item);
      onHudStateChange?.({ heldItem: item });
    },
    [onHeldItemChange, onHudStateChange],
  );

  const applyLook = useCallback((): void => {
    camera.rotation.order = "YXZ";
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
  }, [camera]);

  const publishPlayerPose = useCallback(
    (moving: boolean): void => {
      if (!playerPoseRef) return;
      const keys = keysRef.current;
      playerPoseRef.current = {
        position: [playerPositionRef.current.x, 0, playerPositionRef.current.z],
        yaw: yawRef.current,
        pitch: pitchRef.current,
        moving,
        sprinting: isSprintKeyDown(keys),
        jumping: jumpingRef.current,
        verticalOffset: jumpOffsetRef.current,
        viewMode: viewModeRef.current,
      };
    },
    [playerPoseRef],
  );

  const updateCameraForView = useCallback((): void => {
    const drivingVehicle = drivingVehicleRef.current;
    if (drivingVehicle) {
      const [vehicleX, , vehicleZ] = drivingVehicle.position;
      camera.userData.aimashiPlayerPosition = {
        x: vehicleX,
        y: 1.05,
        z: vehicleZ,
      };
      camera.userData.aimashiPlayerViewMode = "driving";
      camera.userData.aimashiPlayerMovementIntent = "idle";
      camera.userData.aimashiControlledVehiclePose = {
        id: drivingVehicle.id,
        x: vehicleX,
        z: vehicleZ,
        yaw: drivingVehicle.yaw,
      };
      computeVehicleChaseCameraPose({
        vehicle: drivingVehicle,
        cameraPosition: thirdPersonCameraPosition,
        cameraTarget: thirdPersonCameraTarget,
        cameraYawOffset: drivingCameraYawOffsetRef.current,
        pitch: pitchRef.current,
      });
      camera.position.copy(thirdPersonCameraPosition);
      camera.lookAt(thirdPersonCameraTarget);
      return;
    }

    const playerPosition = playerPositionRef.current;
    const eyeY = resolveFirstPersonEyeY(jumpOffsetRef.current);
    camera.userData.aimashiPlayerPosition = {
      x: playerPosition.x,
      y: eyeY,
      z: playerPosition.z,
    };
    camera.userData.aimashiPlayerViewMode = viewModeRef.current;
    camera.userData.aimashiPlayerMovementIntent =
      resolveFirstPersonMovementIntent({
        moving: lastMovingRef.current,
        sprinting: lastSprintingRef.current,
      });
    if (viewModeRef.current === "thirdPerson") {
      computeThirdPersonCameraPose({
        playerPosition,
        yaw: yawRef.current,
        pitch: pitchRef.current,
        eyeY,
        cameraPosition: thirdPersonCameraPosition,
        cameraTarget: thirdPersonCameraTarget,
      });
      camera.position.copy(thirdPersonCameraPosition);
      camera.lookAt(thirdPersonCameraTarget);
      return;
    }

    camera.position.set(playerPosition.x, eyeY, playerPosition.z);
    applyLook();
  }, [applyLook, camera, thirdPersonCameraPosition, thirdPersonCameraTarget]);

  const enterVehicle = useCallback(
    (vehicle: DrivableVehicleDefinition): void => {
      const vehiclePose = createVehiclePose(vehicle);
      const lastPose = camera.userData.aimashiControlledVehiclePose as
        | { id: string; x: number; z: number; yaw: number }
        | undefined;
      if (lastPose?.id === vehicle.id) {
        vehiclePose.position = [lastPose.x, vehicle.position[1], lastPose.z];
        vehiclePose.yaw = lastPose.yaw;
      }
      drivingVehicleRef.current = vehiclePose;
      drivingCameraYawOffsetRef.current = 0;
      previousViewModeRef.current =
        viewModeRef.current === "driving" ? "firstPerson" : viewModeRef.current;
      viewModeRef.current = "driving";
      keysRef.current = {};
      jumpingRef.current = false;
      jumpVelocityRef.current = 0;
      jumpOffsetRef.current = 0;
      playerPositionRef.current.set(
        vehiclePose.position[0],
        FPS_START[1],
        vehiclePose.position[2],
      );
      lastMovingRef.current = false;
      lastSprintingRef.current = false;
      onViewModeChange?.("driving");
      publishMotion(false);
      publishPlayerPose(false);
      onHudStateChange?.({
        focusedTarget: vehicle.label,
        interactionHint: "E \u4e0b\u8f66",
        interactionHintMode: "target",
        lastAction: "idle",
      });
      onAction("idle", lastHeldItemRef.current);
      if (document.pointerLockElement !== gl.domElement) {
        const lockRequest = gl.domElement.requestPointerLock();
        void Promise.resolve(lockRequest).catch(() => undefined);
      }
      updateCameraForView();
    },
    [
      camera,
      gl,
      onAction,
      onHudStateChange,
      onViewModeChange,
      publishMotion,
      publishPlayerPose,
      updateCameraForView,
    ],
  );

  const tryExitVehicle = useCallback((): boolean => {
    const vehicle = drivingVehicleRef.current;
    if (!vehicle) return false;

    const exitPosition = resolveVehicleExitPosition(vehicle, (x, z) =>
      isFirstPersonWorldWalkable(x, z, FIRST_PERSON_COLLISION_RADIUS),
    );
    if (!exitPosition) {
      onHudStateChange?.({
        focusedTarget: vehicle.label,
        interactionHint: "\u4e0b\u8f66\u70b9\u88ab\u6321\u4f4f",
        interactionHintMode: "toast",
      });
      return false;
    }

    drivingVehicleRef.current = null;
    const nextViewMode =
      previousViewModeRef.current === "driving"
        ? "firstPerson"
        : previousViewModeRef.current;
    viewModeRef.current = nextViewMode;
    playerPositionRef.current.set(exitPosition.x, FPS_START[1], exitPosition.z);
    keysRef.current = {};
    lastMovingRef.current = false;
    lastSprintingRef.current = false;
    onViewModeChange?.(nextViewMode);
    publishMotion(false);
    publishPlayerPose(false);
    onHudStateChange?.({
      focusedTarget: undefined,
      interactionHint: "\u5df2\u4e0b\u8f66",
      interactionHintMode: "toast",
      lastAction: "idle",
    });
    onAction("idle", lastHeldItemRef.current);
    updateCameraForView();
    return true;
  }, [
    onAction,
    onHudStateChange,
    onViewModeChange,
    publishMotion,
    publishPlayerPose,
    updateCameraForView,
  ]);

  const rotateByMouse = useCallback(
    (movementX: number, movementY: number): void => {
      if (drivingVehicleRef.current) {
        drivingCameraYawOffsetRef.current -= movementX * 0.0024;
      } else {
        yawRef.current -= movementX * 0.0024;
      }
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - movementY * 0.0024,
        -1.12,
        0.78,
      );
      if (viewModeRef.current === "firstPerson") {
        applyLook();
      }
      publishMotion(lastMovingRef.current);
      publishPlayerPose(lastMovingRef.current);
    },
    [applyLook, publishMotion, publishPlayerPose],
  );

  useEffect(() => {
    inputEnabledRef.current = inputEnabled;
  }, [inputEnabled]);

  useEffect(() => {
    rotateByMouseRef.current = rotateByMouse;
  }, [rotateByMouse]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    updateCameraForView();
    publishPlayerPose(lastMovingRef.current);
  }, [publishPlayerPose, updateCameraForView, viewMode]);

  const runCenterInteraction = useCallback((): boolean => {
    if (!inputEnabled) return false;
    if (drivingVehicleRef.current) {
      return tryExitVehicle();
    }
    const candidate = readCenterCandidate();
    if (candidate) {
      if (candidate.data.drivableVehicle) {
        enterVehicle(candidate.data.drivableVehicle);
        return true;
      }
      const result = runInteractionCandidate({
        ...candidate.data,
        currentHeldItem: lastHeldItemRef.current,
        gl,
        onAction,
        onHeldItemChange: publishHeldItem,
        onHudStateChange,
      });
      return result.handled;
    }

    onHudStateChange?.({
      focusedTarget: undefined,
      interactionHint: interactionHintFor({ heldItem: lastHeldItemRef.current }),
      interactionHintMode:
        lastHeldItemRef.current === "none" ? undefined : "held",
      lastAction: "click",
    });
    onAction("click", lastHeldItemRef.current);
    onSceneMissed?.();
    return false;
  }, [
    gl,
    enterVehicle,
    inputEnabled,
    onAction,
    onHudStateChange,
    onSceneMissed,
    publishHeldItem,
    readCenterCandidate,
    tryExitVehicle,
  ]);

  useEffect(() => {
    runCenterInteractionRef.current = runCenterInteraction;
  }, [runCenterInteraction]);

  useEffect(() => {
    playerPositionRef.current.set(...FPS_START);
    camera.position.set(...FPS_START);
    direction.copy(lookAt).sub(camera.position).normalize();
    yawRef.current = Math.atan2(-direction.x, -direction.z);
    pitchRef.current = THREE.MathUtils.clamp(Math.asin(direction.y), -1.12, 0.78);
    updateCameraForView();
    publishPlayerPose(false);
    if ("fov" in camera) {
      camera.fov = 62;
      camera.near = 0.035;
      camera.updateProjectionMatrix();
    }
    gl.domElement.tabIndex = 0;
    gl.domElement.style.cursor = "none";
    const focusCanvas = (event: PointerEvent): void => {
      if (!inputEnabledRef.current) return;
      if (event.button === 2) {
        event.preventDefault();
        const currentItem = lastHeldItemRef.current;
        if (currentItem !== "none") {
          publishHeldItem("none");
          onHudStateChange?.({
            heldItem: "none",
            lastAction: "put_away",
            focusedTarget: undefined,
            interactionHint: `已放下${labelForHeldItem(currentItem)} · I 打开背包`,
            interactionHintMode: "toast",
          });
          onAction("put_away", currentItem);
        } else {
          onHudStateChange?.({
            lastAction: "click",
            focusedTarget: undefined,
            interactionHint: undefined,
            interactionHintMode: undefined,
          });
          onAction("click", "none");
        }
        return;
      }
      if (event.button !== 0) return;
      gl.domElement.focus({ preventScroll: true });
      if (inventoryOpenRef.current) return;
      if (document.pointerLockElement !== gl.domElement) {
        const lockRequest = gl.domElement.requestPointerLock();
        void Promise.resolve(lockRequest).catch(() => undefined);
        return;
      }
      if (drivingVehicleRef.current) return;
      runCenterInteractionRef.current();
    };
    const preventContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };
    const handleMouseMove = (event: MouseEvent): void => {
      if (!inputEnabledRef.current) return;
      if (document.pointerLockElement !== gl.domElement) return;
      rotateByMouseRef.current(event.movementX, event.movementY);
    };
    gl.domElement.addEventListener("pointerdown", focusCanvas);
    gl.domElement.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      gl.domElement.removeEventListener("pointerdown", focusCanvas);
      gl.domElement.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("mousemove", handleMouseMove);
      gl.domElement.style.cursor = "";
      delete camera.userData.aimashiPlayerPosition;
      delete camera.userData.aimashiPlayerViewMode;
      delete camera.userData.aimashiPlayerMovementIntent;
      delete camera.userData.aimashiControlledVehiclePose;
      keysRef.current = {};
      if (document.pointerLockElement === gl.domElement) {
        void document.exitPointerLock();
      }
    };
  }, [camera, direction, gl, lookAt, publishPlayerPose, updateCameraForView]);

  useEffect(() => {
    if (!selectedItemRequest) return;
    if (selectedItemRequest.tick === lastSelectionTickRef.current) return;
    lastSelectionTickRef.current = selectedItemRequest.tick;
    lastHeldItemRef.current = selectedItemRequest.item;
  }, [selectedItemRequest]);

  useEffect(() => {
    if (inputEnabled) return;
    keysRef.current = {};
    lastSprintingRef.current = false;
    lastMovingRef.current = false;
    publishMotion(false);
    onAction("idle", lastHeldItemRef.current);
    if (document.pointerLockElement === gl.domElement) {
      void document.exitPointerLock();
    }
  }, [gl, inputEnabled, onAction, publishMotion]);

  useEffect(() => {
    const movementCodes = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
    ]);
    const handleDown = (event: KeyboardEvent): void => {
      if (!inputEnabled) return;
      if (isEditableTarget(event.target)) return;
      if (
        event.code === "Escape" &&
        (inventoryOpenRef.current || statusOpenRef.current)
      ) {
        inventoryOpenRef.current = false;
        statusOpenRef.current = false;
        onHudStateChange?.({ inventoryOpen: false, statusOpen: false });
        event.preventDefault();
        return;
      }
      if (
        event.code === "Escape" &&
        document.pointerLockElement === gl.domElement
      ) {
        void document.exitPointerLock();
        event.preventDefault();
        return;
      }
      if (event.code === "KeyI") {
        inventoryOpenRef.current = !inventoryOpenRef.current;
        onHudStateChange?.({ inventoryOpen: inventoryOpenRef.current });
        if (
          inventoryOpenRef.current &&
          document.pointerLockElement === gl.domElement
        ) {
          void document.exitPointerLock();
        }
        event.preventDefault();
        return;
      }
      if (event.code === "KeyM") {
        statusOpenRef.current = !statusOpenRef.current;
        onHudStateChange?.({ statusOpen: statusOpenRef.current });
        event.preventDefault();
        return;
      }
      if (event.code === "KeyV") {
        if (drivingVehicleRef.current) {
          event.preventDefault();
          return;
        }
        const nextMode: FirstPersonViewMode =
          viewModeRef.current === "firstPerson" ? "thirdPerson" : "firstPerson";
        viewModeRef.current = nextMode;
        onViewModeChange?.(nextMode);
        updateCameraForView();
        publishPlayerPose(lastMovingRef.current);
        onHudStateChange?.({
          focusedTarget: undefined,
          interactionHint:
            nextMode === "thirdPerson"
              ? "已切换到第三人称玩家动画预览"
              : "已切换到第一人称",
          interactionHintMode: "toast",
        });
        event.preventDefault();
        return;
      }
      if (event.code === "KeyE") {
        runCenterInteractionRef.current();
        event.preventDefault();
        return;
      }
      if (event.code === "Space") {
        if (!jumpingRef.current) {
          jumpingRef.current = true;
          jumpVelocityRef.current = JUMP_SPEED;
          onHudStateChange?.({ lastAction: "jump" });
          onAction("jump", lastHeldItemRef.current);
          publishMotion(lastMovingRef.current);
        }
        event.preventDefault();
        return;
      }
      if (movementCodes.has(event.code)) {
        keysRef.current[event.code] = true;
        event.preventDefault();
      }
      const item = HELD_ITEM_KEYS[event.code];
      if (item) {
        const action = actionForHeldItem(item);
        publishHeldItem(item);
        onHudStateChange?.({
          lastAction: action,
          focusedTarget: undefined,
          interactionHint:
            item === "none" ? "已切换为空手" : `已装备${labelForHeldItem(item)}`,
          interactionHintMode: "toast",
        });
        onAction(action, item);
        event.preventDefault();
      }
    };
    const handleUp = (event: KeyboardEvent): void => {
      if (!inputEnabled) return;
      if (isEditableTarget(event.target)) return;
      if (!movementCodes.has(event.code)) return;
      keysRef.current[event.code] = false;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, [
    gl,
    inputEnabled,
    onAction,
    onHudStateChange,
    onViewModeChange,
    publishHeldItem,
    publishMotion,
    publishPlayerPose,
    updateCameraForView,
  ]);

  useFrame((_, delta) => {
    if (!inputEnabled) return;
    const keys = keysRef.current;
    const drivingVehicle = drivingVehicleRef.current;
    if (drivingVehicle) {
      const driveForward =
        (keys.KeyW || keys.ArrowUp ? 1 : 0) -
        (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const driveTurn =
        (keys.KeyA || keys.ArrowLeft ? 1 : 0) -
        (keys.KeyD || keys.ArrowRight ? 1 : 0);
      const nextVehicle = resolveVehicleDrivePose({
        vehicle: drivingVehicle,
        forwardInput: driveForward,
        turnInput: driveTurn,
        delta,
        speedMultiplier: isSprintKeyDown(keys) ? VEHICLE_BOOST_MULTIPLIER : 1,
        canOccupy: (x, z) => {
          const vehicleCollisionRadius = Math.max(
            0.42,
            drivingVehicle.collisionRadius * 0.72,
          );
          if (!isFirstPersonWorldWalkable(x, z, vehicleCollisionRadius)) {
            return false;
          }
          const currentVehiclePosition = new THREE.Vector3(
            drivingVehicle.position[0],
            FPS_START[1],
            drivingVehicle.position[2],
          );
          const nextVehiclePosition = new THREE.Vector3(x, FPS_START[1], z);
          return !isDynamicColliderBlockingMove(
            scene,
            currentVehiclePosition,
            nextVehiclePosition,
            vehicleCollisionRadius,
            { ignoredDrivableVehicleId: drivingVehicle.id },
          );
        },
      });
      drivingVehicleRef.current = nextVehicle;
      playerPositionRef.current.set(
        nextVehicle.position[0],
        FPS_START[1],
        nextVehicle.position[2],
      );
      const drivingMoving = Boolean(driveForward || driveTurn);
      hudRaycastTimeRef.current += delta;
      if (hudRaycastTimeRef.current > 0.16) {
        hudRaycastTimeRef.current = 0;
        onHudStateChange?.({
          focusedTarget: nextVehicle.label,
          interactionHint: "E \u4e0b\u8f66",
          interactionHintMode: "target",
          motion: {
            moving: drivingMoving,
            pitch: pitchRef.current,
            sprinting: isSprintKeyDown(keys),
            jumping: false,
            verticalOffset: 0,
          },
        });
      }
      updateCameraForView();
      publishPlayerPose(drivingMoving);
      return;
    }
    hudRaycastTimeRef.current += delta;
    if (hudRaycastTimeRef.current > 0.16) {
      hudRaycastTimeRef.current = 0;
      const candidate = readCenterCandidate();
      onHudStateChange?.({
        focusedTarget: candidate?.profile?.label ?? candidate?.interactionKind,
        interactionHint: interactionHintFor({
          heldItem: lastHeldItemRef.current,
          profile: candidate?.profile,
          interactionKind: candidate?.interactionKind,
        }),
        interactionHintMode: candidate
          ? "target"
          : lastHeldItemRef.current === "none"
            ? undefined
            : "held",
      });
    }
    const forward =
      (keys.KeyW || keys.ArrowUp ? 1 : 0) -
      (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const strafe =
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const moving = Boolean(forward || strafe);
    const sprinting = isSprintKeyDown(keys);

    if (moving) {
      if (viewModeRef.current === "firstPerson") {
        applyLook();
      }
      direction
        .set(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current))
        .normalize();
      right.crossVectors(direction, camera.up).normalize();
      move
        .copy(direction)
        .multiplyScalar(forward)
        .addScaledVector(right, strafe);
      if (move.lengthSq() > 0) move.normalize();
      const speed = sprinting ? SPRINT_MOVE_SPEED : WALK_MOVE_SPEED;
      const nextPosition = playerPositionRef.current
        .clone()
        .addScaledVector(move, speed * delta);
      nextPosition.y = FPS_START[1];
      const currentGroundPosition = playerPositionRef.current.clone();
      currentGroundPosition.y = FPS_START[1];
      const staticResolved = resolveFirstPersonMove(
        currentGroundPosition,
        nextPosition,
      );
      playerPositionRef.current.copy(
        resolveDynamicFirstPersonMove(scene, currentGroundPosition, staticResolved),
      );
      playerPositionRef.current.y = FPS_START[1];
    }

    if (jumpingRef.current) {
      const stableDelta = Math.min(delta, 1 / 30);
      jumpVelocityRef.current += JUMP_GRAVITY * stableDelta;
      jumpOffsetRef.current += jumpVelocityRef.current * stableDelta;
      jumpOffsetRef.current = THREE.MathUtils.clamp(
        jumpOffsetRef.current,
        0,
        MAX_JUMP_OFFSET,
      );
      if (jumpOffsetRef.current <= 0 && jumpVelocityRef.current <= 0) {
        jumpOffsetRef.current = 0;
        jumpVelocityRef.current = 0;
        jumpingRef.current = false;
        const nextAction = moving ? "walk" : restingActionFor(lastHeldItemRef.current);
        onHudStateChange?.({ lastAction: nextAction });
        onAction(nextAction, lastHeldItemRef.current);
      }
    }

    updateCameraForView();
    publishPlayerPose(moving);

    if (moving !== lastMovingRef.current || sprinting !== lastSprintingRef.current) {
      const movingChanged = moving !== lastMovingRef.current;
      lastMovingRef.current = moving;
      lastSprintingRef.current = sprinting;
      publishMotion(moving);
      if (movingChanged && !jumpingRef.current) {
        const nextAction = moving
          ? "walk"
          : restingActionFor(lastHeldItemRef.current);
        onHudStateChange?.({ lastAction: nextAction });
        onAction(nextAction, lastHeldItemRef.current);
      }
    } else if (jumpingRef.current) {
      publishMotion(moving);
    }
  });

  return <></>;
}

