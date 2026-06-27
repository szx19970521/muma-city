import { Suspense, memo, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  createAgentAvatarProfileFromSeed,
  type AgentAvatarProfile,
} from "../avatars/profile";
import treeGlbUrl from "../assets/tree.glb?url";
import building1GlbUrl from "../assets/building1.glb?url";
import building2GlbUrl from "../assets/building2.glb?url";
import apartmentGlbUrl from "../assets/apartment.glb?url";
import apartment2GlbUrl from "../assets/apartment2.glb?url";
import streetLightGlbUrl from "../assets/street-light.glb?url";
import trafficLightGlbUrl from "../assets/traffic-light.glb?url";
import { WORLD_W, WORLD_H } from "../core/constants";
import { seededRandom } from "../core/rng";
import { BACKDROP_OVERRIDES } from "../core/backdropOverrides";
import {
  DRIVABLE_PARKED_CAR,
  type DrivableVehicleDefinition,
} from "../core/drivableVehicles";
import { glbClone, normalizeFootprint } from "../core/glb";
import type { RenderAgent } from "../core/types";
import { buildWorldSceneState, type WorldSceneState } from "../core/worldState";
import { VehicleModel, VehicleRainSheen, car1GlbUrl, car2GlbUrl } from "./Traffic";
import { RIGGED_EMPLOYEE_URL, RiggedCharacter } from "./RiggedCharacter";
import {
  BANK_W,
  BANK_D,
  BANK_X,
  BANK_Z,
  BANK_STREET_GAP,
  ROADS,
  ROAD_SOUTH_Z,
  ROAD_NORTH_Z,
  ROAD_EAST_X,
  ROAD_WIDTH,
  ROAD_LEN,
  ROAD_Y,
  ROAD_MARKING_Y,
  PARK_CLEARING,
  PARK_LAKE,
  SHOWROOM_W,
  SHOWROOM_D,
  SHOWROOM_X,
  SHOWROOM_Z,
  VIEW_BLOCKER_SPOTS,
  rectIntersectsParkClearing,
} from "../core/cityPlan";

// ── Shared geometry / materials ────────────────────────────────────────────
// Road surfaces share one unit plane (scaled per mesh) + one material. The
// module-level singletons are used with dispose={null} so an unmount of the
// Office tab can't dispose a shared resource out from under a remount.
const unitPlaneGeo = new THREE.PlaneGeometry(1, 1);
const roadMat = new THREE.MeshStandardMaterial({
  color: "#4a4e57",
  roughness: 0.95,
});

// Detailed near-building models. A GLB (1 mesh, a few material primitives) is
// ~3-5 draw calls regardless of size — an order of magnitude cheaper than the
// old procedural boxes, which spawned one plane mesh per window (hundreds of
// draw calls). Far buildings stay as flat windowless boxes (1 draw call, and
// fog hides the missing detail anyway).
const BUILDING_URLS = [
  apartmentGlbUrl,
  apartment2GlbUrl,
  building1GlbUrl,
  building2GlbUrl,
];

const SOUTH_SIGNAL_CYCLE_S = 16;
const SOUTH_SIGNAL_STOP_S = 5;
const SOUTH_CROSSWALK_X = 0;
const SOUTH_CROSSWALK_W = 4.2;
const SOUTH_CROSSWALK_STOP_LINE_OFFSET = 2.55;
const SOUTH_PARKING_W = 30.8;
const SOUTH_PARKING_D = 11.4;
const SOUTH_PARKING_CENTRE_Z =
  ROAD_SOUTH_Z + ROAD_WIDTH / 2 + 2.2 + SOUTH_PARKING_D / 2;
const SOUTH_PARKING_MIN_X = -SOUTH_PARKING_W / 2;
const SOUTH_PARKING_MAX_X = SOUTH_PARKING_W / 2;
const SOUTH_PARKING_MIN_Z = SOUTH_PARKING_CENTRE_Z - SOUTH_PARKING_D / 2;
const SOUTH_PARKING_MAX_Z = SOUTH_PARKING_CENTRE_Z + SOUTH_PARKING_D / 2;
const SOUTH_FASTFOOD_W = 24.4;
const SOUTH_FASTFOOD_D = 13.8;
const SOUTH_FASTFOOD_CENTRE_X = 0;
const SOUTH_FASTFOOD_CENTRE_Z = SOUTH_PARKING_MAX_Z + 22.5;
const SOUTH_FASTFOOD_MIN_X = SOUTH_FASTFOOD_CENTRE_X - SOUTH_FASTFOOD_W / 2;
const SOUTH_FASTFOOD_MAX_X = SOUTH_FASTFOOD_CENTRE_X + SOUTH_FASTFOOD_W / 2;
const SOUTH_FASTFOOD_MIN_Z = SOUTH_FASTFOOD_CENTRE_Z - SOUTH_FASTFOOD_D / 2;
const SOUTH_FASTFOOD_MAX_Z = SOUTH_FASTFOOD_CENTRE_Z + SOUTH_FASTFOOD_D / 2;
const SOUTH_FASTFOOD_FRONT_Z = -SOUTH_FASTFOOD_D / 2;
const SOUTH_FASTFOOD_BACK_Z = SOUTH_FASTFOOD_D / 2;
const SOUTH_FASTFOOD_DOOR_X = 0;
const SOUTH_FASTFOOD_DOOR_W = 2.7;
const SOUTH_FASTFOOD_DOOR_SENSOR_R = 3.35;
const BOX_WINDOW_EPSILON = 0.16;
const GLB_WINDOW_EPSILON = 0.18;
const unitWindowPlaneGeo = new THREE.PlaneGeometry(1, 1);
const FALLBACK_WORLD = buildWorldSceneState(Date.now());

interface CityBackdropWorldVisuals {
  darkness: number;
  wetness: number;
  roadColor: THREE.Color;
  roadGloss: number;
  groundColor: THREE.Color;
  groundRoughness: number;
  groundMetalness: number;
  parkingColor: THREE.Color;
  parkingWalkColor: THREE.Color;
  parkingPaintColor: THREE.Color;
  parkingBorderColor: THREE.Color;
  parkingCurbColor: THREE.Color;
  parkingGloss: number;
  buildingGlow: number;
  facadeSheen: number;
  streetLightOn: boolean;
  streetLightGlow: number;
  windowGlowColor: THREE.Color;
  restaurantWindowGlow: number;
  restaurantSignGlow: number;
  interiorBoost: number;
}

interface GlbMaterialSnapshot {
  material: THREE.MeshStandardMaterial;
  name: string;
  baseColor: THREE.Color;
  baseRoughness: number;
  baseMetalness: number;
  baseEmissive: THREE.Color;
  coverageHint: number;
  dedicatedWindowLike: boolean;
  hasTexture: boolean;
  windowLike: boolean;
  facadeLike: boolean;
}

function lerpColor(
  from: THREE.ColorRepresentation,
  to: THREE.ColorRepresentation,
  amount: number,
): THREE.Color {
  return new THREE.Color(from).lerp(
    new THREE.Color(to),
    THREE.MathUtils.clamp(amount, 0, 1),
  );
}

function createWindowGlowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const gridX = x % 8;
      const gridY = y % 10;
      const inWindow = gridX >= 2 && gridX <= 5 && gridY >= 2 && gridY <= 7;
      const lit = inWindow && seededRandom(x * 17.31 + y * 7.13) > 0.38;

      if (lit) {
        const warmth = 0.88 + seededRandom(x * 11.2 + y * 5.9) * 0.2;
        const nightlife = seededRandom(x * 5.41 + y * 19.3);
        data[idx] = Math.round(255 * warmth);
        data[idx + 1] = Math.round((nightlife > 0.86 ? 185 : 220) * warmth);
        data[idx + 2] = Math.round(
          (nightlife > 0.86 ? 118 : 148) *
            (0.88 + seededRandom(x * 13.7 + y * 3.1) * 0.16),
        );
        data[idx + 3] = 255;
      } else {
        data[idx] = 16;
        data[idx + 1] = 22;
        data[idx + 2] = 32;
        data[idx + 3] = 0;
      }
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const boxWindowTexture = createWindowGlowTexture();

function createFastFoodSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#1b0705");
  grad.addColorStop(0.5, "#6f100c");
  grad.addColorStop(1, "#230806");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#ffc857";
  ctx.lineWidth = 10;
  ctx.shadowColor = "#ffcf63";
  ctx.shadowBlur = 14;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.translate(146, 128);
  ctx.shadowColor = "#ff8a3d";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#f36b2f";
  ctx.beginPath();
  ctx.ellipse(0, 0, 86, 58, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff2c7";
  ctx.beginPath();
  ctx.moveTo(-76, -6);
  ctx.lineTo(8, -45);
  ctx.lineTo(72, -16);
  ctx.lineTo(54, 10);
  ctx.lineTo(78, 46);
  ctx.lineTo(24, 34);
  ctx.lineTo(-18, 56);
  ctx.lineTo(-4, 20);
  ctx.lineTo(-64, 32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = "#ffd36a";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#fff3c4";
  ctx.font = "bold 92px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("小马餐厅", 282, 112);
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#ffc857";
  ctx.font = "30px sans-serif";
  ctx.fillText("Pony Diner · Warm Food & City Lights", 288, 178);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function getCityBackdropWorldVisuals(
  world: WorldSceneState,
): CityBackdropWorldVisuals {
  const darkness = THREE.MathUtils.clamp(1 - world.daylight, 0, 1);
  const wetness = THREE.MathUtils.clamp(
    Math.max(world.weather.roadWetness, world.isNight ? 0.18 : 0),
    0,
    1,
  );
  const rainBoost = world.weather.rainStrength * 0.22;

  return {
    darkness,
    wetness,
    roadColor: lerpColor(
      "#45484f",
      "#232b35",
      0.46 * darkness + 0.24 * wetness,
    ),
    roadGloss: THREE.MathUtils.clamp(wetness * 0.86 + darkness * 0.32, 0, 1),
    groundColor: lerpColor(
      "#a7aaa5",
      "#45505b",
      0.7 * darkness + 0.24 * wetness,
    ),
    groundRoughness: THREE.MathUtils.lerp(
      0.9,
      0.5,
      wetness * 0.48 + darkness * 0.2,
    ),
    groundMetalness: THREE.MathUtils.lerp(
      0,
      0.12,
      wetness * 0.36 + darkness * 0.16,
    ),
    parkingColor: lerpColor(
      "#747b80",
      "#303a45",
      0.48 * darkness + 0.34 * wetness,
    ),
    parkingWalkColor: lerpColor(
      "#d0cec5",
      "#8c98a2",
      0.34 * darkness + 0.22 * wetness,
    ),
    parkingPaintColor: lerpColor(
      "#e3dccb",
      "#cdd3dc",
      0.24 * darkness + 0.12 * wetness,
    ),
    parkingBorderColor: lerpColor(
      "#d4cec0",
      "#bdc6d0",
      0.26 * darkness + 0.12 * wetness,
    ),
    parkingCurbColor: lerpColor(
      "#bfc2be",
      "#9faab4",
      0.24 * darkness + 0.1 * wetness,
    ),
    parkingGloss: THREE.MathUtils.clamp(wetness * 0.9 + darkness * 0.28, 0, 1),
    buildingGlow: world.buildingLightsOn
      ? THREE.MathUtils.lerp(
          0.88,
          1.72,
          Math.max(darkness * 0.9, world.twilight * 0.25),
        )
      : 0,
    facadeSheen: THREE.MathUtils.clamp(wetness * 0.74 + darkness * 0.18, 0, 1),
    streetLightOn: world.streetLightsOn,
    streetLightGlow: world.streetLightsOn
      ? 0.46 + wetness * 0.5 + darkness * 0.34
      : 0,
    windowGlowColor: lerpColor(
      "#ffd383",
      "#fff0b5",
      0.22 + world.weather.cloudCover * 0.18 + rainBoost,
    ),
    restaurantWindowGlow: world.buildingLightsOn
      ? 0.45 + darkness * 0.72
      : world.weather.kind === "rain"
        ? 0.2
        : 0.06,
    restaurantSignGlow: world.streetLightsOn
      ? 0.35 + wetness * 0.5
      : 0.1 + rainBoost,
    interiorBoost: world.interiorLightBoost,
  };
}

/**
 * Detailed backdrop building (apartment / building GLB), auto-normalised:
 * recentred, grounded at y=0 and uniformly scaled so its footprint fits the
 * city-grid cell, with a random quarter-turn for variety.
 */
function CityBuildingGlb({
  x,
  z,
  footprint,
  rotY,
  url,
  buildingGlow,
  facadeSheen,
  windowGlowColor,
  interiorBoost,
  onClick,
}: {
  x: number;
  z: number;
  footprint: number;
  rotY: number;
  url: string;
  buildingGlow: number;
  facadeSheen: number;
  windowGlowColor: THREE.Color;
  interiorBoost: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}): React.JSX.Element {
  const { scene } = useGLTF(url, false, false);
  const object = useMemo(
    () => normalizeFootprint(glbClone(scene, null), footprint),
    [scene, footprint],
  );
  const { materialSnapshots, needsWindowOverlay } = useMemo(() => {
    const snapshotsById = new Map<
      string,
      Omit<GlbMaterialSnapshot, "windowLike" | "facadeLike">
    >();

    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const groupedCounts = new Map<number, number>();
      if (Array.isArray(mesh.material) && mesh.geometry.groups.length > 0) {
        mesh.geometry.groups.forEach((group) => {
          const groupMaterialIndex = group.materialIndex ?? 0;
          groupedCounts.set(
            groupMaterialIndex,
            (groupedCounts.get(groupMaterialIndex) ?? 0) + group.count,
          );
        });
      }

      mats.forEach((mat, materialIndex) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        const materialName = mat.name.toLowerCase();
        const coverageHint =
          groupedCounts.get(materialIndex) ??
          mesh.geometry.index?.count ??
          mesh.geometry.attributes.position?.count ??
          0;
        const existing = snapshotsById.get(mat.uuid);
        if (existing) {
          existing.coverageHint += coverageHint;
          return;
        }

        snapshotsById.set(mat.uuid, {
          material: mat,
          name: materialName,
          baseColor: mat.color.clone(),
          baseRoughness: mat.roughness,
          baseMetalness: mat.metalness,
          baseEmissive: mat.emissive.clone(),
          coverageHint,
          dedicatedWindowLike: /window|glass/.test(materialName),
          hasTexture: Boolean(mat.map),
        });
      });
    });

    const maxCoverage = Math.max(
      1,
      ...Array.from(snapshotsById.values(), (snapshot) => snapshot.coverageHint),
    );
    const hsl = { h: 0, s: 0, l: 0 };
    const snapshots = Array.from(snapshotsById.values(), (snapshot) => {
      snapshot.baseColor.getHSL(hsl);
      const coverageRatio = snapshot.coverageHint / maxCoverage;
      const blueBias =
        snapshot.baseColor.b -
        Math.max(snapshot.baseColor.r, snapshot.baseColor.g);
      const likelyGlassTint =
        hsl.h >= 0.5 &&
        hsl.h <= 0.63 &&
        hsl.s >= 0.16 &&
        hsl.l >= 0.16 &&
        hsl.l <= 0.72;
      const windowLike =
        snapshot.dedicatedWindowLike ||
        (!snapshot.hasTexture &&
          coverageRatio <= 0.22 &&
          likelyGlassTint &&
          blueBias >= 0.035);
      const facadeLike =
        !windowLike &&
        (snapshot.hasTexture ||
          coverageRatio >= 0.14 ||
          /default|border|wall|roof|facade|citybits/.test(snapshot.name) ||
          hsl.l >= 0.2);
      return {
        ...snapshot,
        windowLike,
        facadeLike,
      };
    });

    return {
      materialSnapshots: snapshots,
      needsWindowOverlay: !snapshots.some((snapshot) => snapshot.windowLike),
    };
  }, [object]);
  const objectBounds = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(object);
    return {
      center: bounds.getCenter(new THREE.Vector3()),
      size: bounds.getSize(new THREE.Vector3()),
    };
  }, [object]);

  useLayoutEffect(() => {
    const coolFacadeTint = new THREE.Color("#3d4652");
    const glassTint = new THREE.Color("#93b7cf");

    materialSnapshots.forEach((snapshot) => {
      const { material } = snapshot;
      material.color.copy(snapshot.baseColor);
      material.roughness = snapshot.baseRoughness;
      material.metalness = snapshot.baseMetalness;
      material.emissive.copy(snapshot.baseEmissive);
      material.emissiveIntensity =
        snapshot.baseEmissive.r +
          snapshot.baseEmissive.g +
          snapshot.baseEmissive.b >
        0
          ? 1
          : 0;

      if (snapshot.facadeLike) {
        material.roughness = THREE.MathUtils.lerp(
          snapshot.baseRoughness,
          Math.max(0.18, snapshot.baseRoughness - 0.34),
          facadeSheen,
        );
        material.metalness = THREE.MathUtils.lerp(
          snapshot.baseMetalness,
          Math.min(0.2, snapshot.baseMetalness + 0.08),
          facadeSheen,
        );
        material.color.lerp(coolFacadeTint, Math.min(0.18, facadeSheen * 0.22));
      }

      if (snapshot.windowLike && buildingGlow > 0.02) {
        material.color.lerp(glassTint, 0.12 + facadeSheen * 0.06);
        material.roughness = Math.max(
          0.08,
          material.roughness - 0.18 * facadeSheen,
        );
        material.metalness = Math.max(
          material.metalness,
          0.08 + facadeSheen * 0.08,
        );
        material.emissive.copy(windowGlowColor);
        material.emissiveIntensity = buildingGlow * 0.96 * interiorBoost;
      }
    });
  }, [
    buildingGlow,
    facadeSheen,
    interiorBoost,
    materialSnapshots,
    windowGlowColor,
  ]);

  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]} onClick={onClick}>
      <primitive object={object} />
      {buildingGlow > 0.02 && needsWindowOverlay ? (
        <GlbBuildingWindowLights
          width={objectBounds.size.x}
          depth={objectBounds.size.z}
          height={objectBounds.size.y}
          center={objectBounds.center}
          glowColor={windowGlowColor}
          opacity={THREE.MathUtils.clamp(
            buildingGlow * 0.34 * interiorBoost,
            0,
            0.48,
          )}
        />
      ) : null}
    </group>
  );
}

function TreeGlb({
  x,
  z,
  h,
}: {
  x: number;
  z: number;
  h: number;
}): React.JSX.Element {
  const { scene } = useGLTF(treeGlbUrl, false, false);
  const object = useMemo(() => glbClone(scene, null), [scene]);
  const s = h * 0.28;
  return (
    <group
      position={[x, 0, z]}
      scale={[s, s, s]}
      userData={{ aimashiCollisionRadius: Math.max(0.28, s * 0.36) }}
    >
      <primitive object={object} />
    </group>
  );
}

function StreetLightGlb({
  x,
  z,
  rotY = 0,
  lampOn = false,
  glowStrength = 0,
  glowColor = new THREE.Color("#ffe4a3"),
}: {
  x: number;
  z: number;
  rotY?: number;
  lampOn?: boolean;
  glowStrength?: number;
  glowColor?: THREE.Color;
}): React.JSX.Element {
  const { scene } = useGLTF(streetLightGlbUrl, false, false);
  const object = useMemo(() => glbClone(scene, null), [scene]);
  const lightMaterialSnapshots = useMemo(() => {
    const snapshots: Array<{
      material: THREE.MeshStandardMaterial;
      baseColor: THREE.Color;
      baseEmissive: THREE.Color;
      baseRoughness: number;
      baseMetalness: number;
    }> = [];

    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((mat) => {
        if (
          mat instanceof THREE.MeshStandardMaterial &&
          /light/i.test(mat.name)
        ) {
          snapshots.push({
            material: mat,
            baseColor: mat.color.clone(),
            baseEmissive: mat.emissive.clone(),
            baseRoughness: mat.roughness,
            baseMetalness: mat.metalness,
          });
        }
      });
    });

    return snapshots;
  }, [object]);

  useLayoutEffect(() => {
    lightMaterialSnapshots.forEach((snapshot) => {
      const { material } = snapshot;
      material.color.copy(snapshot.baseColor);
      material.emissive.copy(snapshot.baseEmissive);
      material.roughness = snapshot.baseRoughness;
      material.metalness = snapshot.baseMetalness;
      material.emissiveIntensity =
        snapshot.baseEmissive.r +
          snapshot.baseEmissive.g +
          snapshot.baseEmissive.b >
        0
          ? 1
          : 0;

      if (lampOn) {
        material.color.lerp(glowColor, 0.18);
        material.roughness = Math.max(0.16, snapshot.baseRoughness - 0.22);
        material.emissive.copy(glowColor);
        material.emissiveIntensity = 0.72 + glowStrength * 0.92;
      }
    });
  }, [glowColor, glowStrength, lampOn, lightMaterialSnapshots]);

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, rotY, 0]}
      scale={[0.8, 0.8, 0.8]}
      userData={{ aimashiCollisionRadius: 0.26 }}
    >
      <primitive object={object} />
      {lampOn ? (
        <pointLight
          position={[0, 4.88, 1.28]}
          color={glowColor}
          intensity={0.22 + glowStrength * 0.34}
          distance={5.1 + glowStrength * 1.5}
          decay={2}
        />
      ) : null}
    </group>
  );
}

function TrafficLightGlb({
  x,
  z,
  rotY = 0,
}: {
  x: number;
  z: number;
  rotY?: number;
}): React.JSX.Element {
  const { scene } = useGLTF(trafficLightGlbUrl, false, false);
  const object = useMemo(() => glbClone(scene, null), [scene]);
  return (
    <group
      position={[x, 0, z]}
      rotation={[0, rotY, 0]}
      scale={[1.6, 1.6, 1.6]}
      userData={{ aimashiCollisionRadius: 0.34 }}
    >
      <primitive object={object} />
    </group>
  );
}

function ParkedCar({
  x,
  z,
  rotY,
  url,
  tint,
  rainStrength = 0,
  targetLen = 2.3,
  drivableVehicle,
}: {
  x: number;
  z: number;
  rotY: number;
  url: string;
  tint: string;
  rainStrength?: number;
  targetLen?: number;
  drivableVehicle?: DrivableVehicleDefinition;
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const yawOffset = url === car1GlbUrl ? Math.PI : 0;

  useFrame(() => {
    if (!drivableVehicle) return;
    const pose = camera.userData.aimashiControlledVehiclePose as
      | { id: string; x: number; z: number; yaw: number }
      | undefined;
    const group = groupRef.current;
    if (!pose || pose.id !== drivableVehicle.id || !group) return;
    group.position.set(pose.x, 0.018, pose.z);
    group.rotation.y = pose.yaw + rotY + yawOffset;
  });

  return (
    <group
      ref={groupRef}
      position={[x, 0.018, z]}
      rotation={[0, rotY + yawOffset, 0]}
      userData={{
        aimashiCollisionRadius: targetLen > 3 ? 1.35 : 0.95,
        aimashiDrivableVehicle: drivableVehicle,
        aimashiInteractionProfile: drivableVehicle
          ? { kind: "vehicle", label: drivableVehicle.label }
          : undefined,
      }}
    >
      <VehicleModel url={url} tint={tint} targetLen={targetLen} />
      <VehicleRainSheen strength={rainStrength} targetLen={targetLen} />
    </group>
  );
}

function RotatingParkedCar({
  x,
  z,
  rotY,
  url,
  tint,
  rainStrength = 0,
  targetLen = 2.3,
  phase = 0,
}: {
  x: number;
  z: number;
  rotY: number;
  url: string;
  tint: string;
  rainStrength?: number;
  targetLen?: number;
  phase?: number;
}): React.JSX.Element {
  const ref = useRef<THREE.Group>(null);
  const yawOffset = url === car1GlbUrl ? Math.PI : 0;

  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const period = 86;
    const t = (clock.elapsedTime + phase) % period;
    const enterS = 5;
    const leaveS = 6;
    const awayS = 14;
    const parkedS = period - enterS - leaveS - awayS;
    const outDistance = 6.6;
    let offset = 0;
    let visible = true;

    if (t < enterS) {
      offset = THREE.MathUtils.lerp(outDistance, 0, t / enterS);
    } else if (t < enterS + parkedS) {
      offset = 0;
    } else if (t < enterS + parkedS + leaveS) {
      offset = THREE.MathUtils.lerp(0, outDistance, (t - enterS - parkedS) / leaveS);
    } else {
      offset = outDistance + 20;
      visible = false;
    }

    group.visible = visible;
    group.position.set(x + Math.sin(rotY) * offset, 0.018, z + Math.cos(rotY) * offset);
  });

  return (
    <group
      ref={ref}
      position={[x, 0.018, z]}
      rotation={[0, rotY + yawOffset, 0]}
      userData={{ aimashiCollisionRadius: targetLen > 3 ? 1.35 : 0.95 }}
    >
      <VehicleModel url={url} tint={tint} targetLen={targetLen} />
      <VehicleRainSheen strength={rainStrength} targetLen={targetLen} />
    </group>
  );
}

function EvChargingCable({
  from,
  to,
}: {
  from: [number, number];
  to: [number, number];
}): React.JSX.Element {
  const curve = useMemo(() => {
    const start = new THREE.Vector3(from[0], 0.72, from[1]);
    const end = new THREE.Vector3(to[0], 0.48, to[1]);
    const mid = new THREE.Vector3(
      (from[0] + to[0]) / 2,
      0.34,
      (from[1] + to[1]) / 2,
    );
    return new THREE.CatmullRomCurve3([start, mid, end]);
  }, [from, to]);
  const plugRot = Math.atan2(to[0] - from[0], to[1] - from[1]);

  return (
    <group>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 18, 0.035, 8, false]} />
        <meshStandardMaterial color="#111827" roughness={0.82} />
      </mesh>
      <mesh position={[to[0], 0.49, to[1]]} rotation={[0, plugRot, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.11, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.48} metalness={0.18} />
      </mesh>
    </group>
  );
}

function EvCharger({
  x,
  z,
  rotY = 0,
  cableTo,
}: {
  x: number;
  z: number;
  rotY?: number;
  cableTo?: [number, number];
}): React.JSX.Element {
  return (
    <group>
      <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
        <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.72, 0.18, 0.72]} />
          <meshStandardMaterial color="#596778" roughness={0.72} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 1.28, 0.34]} />
          <meshStandardMaterial
            color="#2c4058"
            roughness={0.38}
            metalness={0.18}
          />
        </mesh>
        <mesh position={[0, 1.43, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.62, 0.12, 0.42]} />
          <meshStandardMaterial color="#16283d" roughness={0.36} metalness={0.22} />
        </mesh>
        <mesh position={[0, 0.24, 0.175]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 0.16, 0.045]} />
          <meshStandardMaterial color="#0f1f33" roughness={0.44} metalness={0.14} />
        </mesh>
        <mesh position={[0, 1.03, 0.18]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.28, 0.04]} />
          <meshStandardMaterial
            color="#1e88e5"
            emissive="#38bdf8"
            emissiveIntensity={0.65}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.42, 0.19]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 0.3, 0.05]} />
          <meshStandardMaterial
            color="#7dd3fc"
            emissive="#22c55e"
            emissiveIntensity={0.4}
            toneMapped={false}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0.19, 0.64, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.48, 8]} />
          <meshStandardMaterial color="#36404c" roughness={0.72} />
        </mesh>
      </group>
      {cableTo ? <EvChargingCable from={[x, z]} to={cableTo} /> : null}
    </group>
  );
}

function ParkingCanopy({
  x,
  z,
  width,
  depth,
  visuals,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  visuals: CityBackdropWorldVisuals;
}): React.JSX.Element {
  const roofColor = lerpColor("#2f4056", "#1d2735", visuals.darkness * 0.45);
  const trimColor = lerpColor("#425369", "#263448", visuals.darkness * 0.4);
  const glassColor = lerpColor("#9eb7cc", "#5f7489", visuals.darkness * 0.35);
  const wetGloss = THREE.MathUtils.clamp(visuals.wetness * 0.85, 0, 1);

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.16, depth]} />
        <meshStandardMaterial
          color={roofColor}
          roughness={THREE.MathUtils.lerp(0.52, 0.18, wetGloss)}
          metalness={THREE.MathUtils.lerp(0.12, 0.28, wetGloss)}
        />
      </mesh>
      <mesh position={[0, 2.99, 0]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.42, 0.045, depth - 0.42]} />
        <meshStandardMaterial
          color={glassColor}
          transparent
          opacity={0.44}
          roughness={THREE.MathUtils.lerp(0.16, 0.06, wetGloss)}
          metalness={0.08}
          depthWrite={false}
        />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh
          key={`canopy-post-${sx}-${sz}`}
          position={[sx * (width / 2 - 0.36), 1.42, sz * (depth / 2 - 0.36)]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.07, 0.085, 2.74, 10]} />
          <meshStandardMaterial color="#445160" roughness={0.46} metalness={0.28} />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh key={`canopy-trim-z-${sz}`} position={[0, 2.76, sz * depth / 2]} castShadow>
          <boxGeometry args={[width + 0.1, 0.12, 0.14]} />
          <meshStandardMaterial color={trimColor} roughness={0.42} metalness={0.18} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`canopy-trim-x-${sx}`} position={[sx * width / 2, 2.76, 0]} castShadow>
          <boxGeometry args={[0.14, 0.12, depth + 0.1]} />
          <meshStandardMaterial color={trimColor} roughness={0.42} metalness={0.18} />
        </mesh>
      ))}
      {[0, 1].map((index) => (
        <mesh
          key={`canopy-drip-${index}`}
          position={[-width / 2 + 1.2 + index * (width - 2.4), 2.71, -depth / 2 - 0.08]}
        >
          <boxGeometry args={[0.72, 0.035, 0.05]} />
          <meshStandardMaterial
            color="#bfe5ff"
            emissive="#86d7ff"
            emissiveIntensity={visuals.wetness * 0.24}
            transparent
            opacity={0.24 + visuals.wetness * 0.22}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function ParkingRainRipples({
  strength,
}: {
  strength: number;
}): React.JSX.Element | null {
  const groupRef = useRef<THREE.Group>(null);
  const visibleStrength = THREE.MathUtils.clamp(strength, 0, 1);
  const ripples = useMemo(
    () =>
      Array.from({ length: 34 }).map((_, index) => ({
        x:
          SOUTH_PARKING_MIN_X +
          1.2 +
          seededRandom(index * 9.7 + 2.1) * (SOUTH_PARKING_W - 2.4),
        z:
          SOUTH_PARKING_MIN_Z +
          0.9 +
          seededRandom(index * 11.3 + 4.8) * (SOUTH_PARKING_D - 1.8),
        phase: seededRandom(index * 13.7 + 8.2) * Math.PI * 2,
        size: 0.22 + seededRandom(index * 17.1 + 5.4) * 0.34,
      })),
    [],
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((child, index) => {
      const ripple = ripples[index];
      const phase = (clock.elapsedTime * 1.9 + ripple.phase) % 1;
      const scale = 0.4 + phase * 1.9;
      child.scale.setScalar(scale);
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.opacity = (1 - phase) * 0.22 * visibleStrength;
    });
  });

  if (visibleStrength <= 0.02) return null;

  return (
    <group ref={groupRef}>
      {ripples.map((ripple, index) => (
        <mesh
          key={`parking-rain-ripple-${index}`}
          position={[ripple.x, 0.04, ripple.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <ringGeometry args={[ripple.size * 0.62, ripple.size, 20]} />
          <meshStandardMaterial
            color="#d7ebff"
            emissive="#a8d8ff"
            emissiveIntensity={0.12}
            transparent
            opacity={0.1 * visibleStrength}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function CityRainRipples({
  strength,
}: {
  strength: number;
}): React.JSX.Element | null {
  const groupRef = useRef<THREE.Group>(null);
  const visibleStrength = THREE.MathUtils.clamp(strength, 0, 1);
  const ripples = useMemo(
    () =>
      Array.from({ length: 76 }).map((_, index) => {
        const road = ROADS[index % ROADS.length];
        const along = (seededRandom(index * 8.9 + 1.7) - 0.5) * 92;
        const laneOffset =
          (seededRandom(index * 10.3 + 5.2) - 0.5) * (ROAD_WIDTH - 0.7);
        return {
          x: road.axis === "x" ? along : road.center + laneOffset,
          z: road.axis === "x" ? road.center + laneOffset : along,
          phase: seededRandom(index * 13.1 + 3.6) * Math.PI * 2,
          size: 0.18 + seededRandom(index * 15.4 + 7.8) * 0.32,
        };
      }),
    [],
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    group.children.forEach((child, index) => {
      const ripple = ripples[index];
      const phase = (clock.elapsedTime * 2.15 + ripple.phase) % 1;
      const scale = 0.35 + phase * 2.1;
      child.scale.setScalar(scale);
      const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      material.opacity = (1 - phase) * 0.16 * visibleStrength;
    });
  });

  if (visibleStrength <= 0.02) return null;

  return (
    <group ref={groupRef}>
      {ripples.map((ripple, index) => (
        <mesh
          key={`city-rain-ripple-${index}`}
          position={[ripple.x, ROAD_MARKING_Y + 0.012, ripple.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <ringGeometry args={[ripple.size * 0.62, ripple.size, 18]} />
          <meshStandardMaterial
            color="#d7ebff"
            emissive="#a8d8ff"
            emissiveIntensity={0.09}
            transparent
            opacity={0.08 * visibleStrength}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function FastFoodDoubleDoor({
  worldX,
  worldZ,
  localFrontZ,
  windowColor,
  wetness,
}: {
  worldX: number;
  worldZ: number;
  localFrontZ: number;
  windowColor: THREE.Color;
  wetness: number;
}): React.JSX.Element {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const opennessRef = useRef(0);
  const leafW = SOUTH_FASTFOOD_DOOR_W / 2 + 0.05;
  const doorH = 2.32;
  const doorZ = localFrontZ - 0.12;

  useFrame(({ camera }, delta) => {
    const playerPosition = camera.userData.aimashiPlayerPosition as
      | { x: number; y: number; z: number }
      | undefined;
    const sensorX = playerPosition?.x ?? camera.position.x;
    const sensorZ = playerPosition?.z ?? camera.position.z;
    const near =
      Math.hypot(sensorX - worldX, sensorZ - (worldZ + doorZ)) <
      SOUTH_FASTFOOD_DOOR_SENSOR_R;
    opennessRef.current = THREE.MathUtils.damp(opennessRef.current, near ? 1 : 0, 7, delta);
    const swing = opennessRef.current * 0.95;
    if (leftRef.current) leftRef.current.rotation.y = swing;
    if (rightRef.current) rightRef.current.rotation.y = -swing;
  });

  const wood = "#6d3b1f";
  const metal = "#2f3742";

  return (
    <group position={[SOUTH_FASTFOOD_DOOR_X, 0, doorZ]}>
      <mesh position={[0, doorH + 0.11, 0]} castShadow receiveShadow>
        <boxGeometry args={[SOUTH_FASTFOOD_DOOR_W + 0.46, 0.2, 0.22]} />
        <meshStandardMaterial color={metal} roughness={0.42} metalness={0.28} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`ff-door-jamb-${side}`} position={[side * (SOUTH_FASTFOOD_DOOR_W / 2 + 0.12), doorH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.2, doorH, 0.22]} />
          <meshStandardMaterial color={metal} roughness={0.42} metalness={0.28} />
        </mesh>
      ))}
      <mesh position={[0, doorH / 2, 0.03]} castShadow receiveShadow>
        <boxGeometry args={[0.08, doorH - 0.12, 0.12]} />
        <meshStandardMaterial color={metal} roughness={0.42} metalness={0.28} />
      </mesh>
      <group ref={leftRef} position={[-SOUTH_FASTFOOD_DOOR_W / 2, 0, 0]}>
        <group position={[leafW / 2, 0, 0]}>
          <mesh position={[0, doorH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[leafW, doorH, 0.12]} />
            <meshStandardMaterial color={wood} roughness={0.62} metalness={0.04} />
          </mesh>
          <mesh position={[0, 1.54, -0.065]}>
            <boxGeometry args={[leafW * 0.66, 0.82, 0.035]} />
            <meshStandardMaterial
              color={windowColor}
              roughness={THREE.MathUtils.lerp(0.18, 0.08, wetness * 0.6)}
              metalness={THREE.MathUtils.lerp(0.08, 0.2, wetness * 0.6)}
              transparent
              opacity={0.26}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[leafW * 0.28, 1.1, -0.09]}>
            <boxGeometry args={[0.08, 0.34, 0.04]} />
            <meshStandardMaterial color="#f0c34a" roughness={0.38} metalness={0.45} />
          </mesh>
        </group>
      </group>
      <group ref={rightRef} position={[SOUTH_FASTFOOD_DOOR_W / 2, 0, 0]}>
        <group position={[-leafW / 2, 0, 0]}>
          <mesh position={[0, doorH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[leafW, doorH, 0.12]} />
            <meshStandardMaterial color={wood} roughness={0.62} metalness={0.04} />
          </mesh>
          <mesh position={[0, 1.54, -0.065]}>
            <boxGeometry args={[leafW * 0.66, 0.82, 0.035]} />
            <meshStandardMaterial
              color={windowColor}
              roughness={THREE.MathUtils.lerp(0.18, 0.08, wetness * 0.6)}
              metalness={THREE.MathUtils.lerp(0.08, 0.2, wetness * 0.6)}
              transparent
              opacity={0.26}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[-leafW * 0.28, 1.1, -0.09]}>
            <boxGeometry args={[0.08, 0.34, 0.04]} />
            <meshStandardMaterial color="#f0c34a" roughness={0.38} metalness={0.45} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export type ScenicNpcPose = "idle" | "walking";
type ScenicNpcGender = "male" | "female";
export type ScenicNpcRole = "server" | "pedestrian";

export interface StreetPedestrianRoute {
  start: [number, number];
  end: [number, number];
  gender: ScenicNpcGender;
  topColor: string;
  cross?: boolean;
}

interface StreetObserverPosition {
  x: number;
  z: number;
}

export const STREET_NPC_ENTRY_AVOIDANCE_ZONE = {
  minX: -7.2,
  maxX: 7.2,
  minZ: ROAD_SOUTH_Z - ROAD_WIDTH / 2 - 3.2,
  maxZ: ROAD_SOUTH_Z + ROAD_WIDTH / 2 + 3.4,
} as const;

const STREET_NPC_MIN_ROUTE_DISTANCE = 16;
const STREET_NPC_WALK_SPEED = 0.82;
const STREET_NPC_MIN_WALK_SPEED = 0.08;
const STREET_NPC_EXIT_HOLD_S = 2.8;
const STREET_NPC_RESET_HOLD_S = 4.5;
const STREET_NPC_OBSERVER_RESPAWN_CLEARANCE = 12;

export function resolveScenicNpcRenderState({
  pose,
  role,
}: {
  pose: ScenicNpcPose;
  role: ScenicNpcRole;
}): RenderAgent["state"] {
  if (pose === "walking") return "walking";
  if (role === "server") return "using_tools";
  return "standing";
}

function createScenicNpcProfile(
  seed: string,
  gender: ScenicNpcGender,
  role: ScenicNpcRole,
  topColor: string,
): AgentAvatarProfile {
  const base = createAgentAvatarProfileFromSeed(`scenic-${role}-${gender}-${seed}`);
  const server = role === "server";
  const male = gender === "male";
  return {
    ...base,
    hair: {
      style: male ? "short" : base.hair.style === "spiky" ? "parted" : base.hair.style,
      color: male ? "#2a211d" : base.hair.color,
    },
    clothing: {
      topStyle: server ? "jacket" : male ? "hoodie" : "tee",
      topColor,
      bottomStyle: "pants",
      bottomColor: server ? "#27313d" : male ? "#334155" : "#374151",
      shoesColor: "#171717",
    },
    accessories: {
      ...base.accessories,
      headset: false,
      hatStyle: "none",
      backpack: !server && male,
    },
  };
}

function createScenicRenderAgent(
  id: string,
  profile: AgentAvatarProfile,
  state: RenderAgent["state"],
): RenderAgent {
  return {
    id,
    name: id,
    status: "idle",
    color: profile.clothing.topColor,
    item: "npc",
    avatarProfile: profile,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    path: [],
    facing: 0,
    frame: 0,
    walkSpeed: state === "walking" ? 0.75 : 0,
    phaseOffset: 0,
    state,
  };
}

function ScenicNpcFigure({
  id,
  pose,
  poseRef,
  profile,
  role = "pedestrian",
  umbrella = false,
  tray = false,
  scaleMultiplier = 2.56,
}: {
  id: string;
  pose: ScenicNpcPose;
  poseRef?: { current: ScenicNpcPose };
  profile: AgentAvatarProfile;
  role?: ScenicNpcRole;
  umbrella?: boolean;
  tray?: boolean;
  scaleMultiplier?: number;
}): React.JSX.Element {
  const state = resolveScenicNpcRenderState({ pose, role });
  const agentRef = useRef<RenderAgent | null>(null);
  if (!agentRef.current) {
    agentRef.current = createScenicRenderAgent(id, profile, state);
  }
  const agentsRef = useRef<RenderAgent[]>([]);
  const lookupRef = useRef<Map<string, RenderAgent>>(new Map());
  agentsRef.current = [agentRef.current];
  lookupRef.current.set(id, agentRef.current);

  useFrame(({ clock }) => {
    const agent = agentRef.current;
    if (!agent) return;
    const livePose = poseRef?.current ?? pose;
    const liveState = resolveScenicNpcRenderState({ pose: livePose, role });
    agent.state = liveState;
    agent.walkSpeed = liveState === "walking" ? 0.75 : 0;
    agent.frame = clock.elapsedTime * 60;
  });

  return (
    <group
      userData={{
        aimashiAgentId: id,
        aimashiCollisionRadius: 0.38,
      }}
    >
      <RiggedCharacter
        url={RIGGED_EMPLOYEE_URL}
        agentId={id}
        agentsRef={agentsRef}
        agentLookupRef={lookupRef}
        tint={profile.clothing.topColor}
        appearance={profile}
        scaleMultiplier={scaleMultiplier}
      />
      {tray ? (
        <mesh position={[0.28, 1.02, -0.28]} rotation={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.42, 0.035, 0.24]} />
          <meshStandardMaterial color="#2b211b" roughness={0.62} metalness={0.08} />
        </mesh>
      ) : null}
      {umbrella ? (
        <group position={[0.22, 1.86, -0.08]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.72, 8]} />
            <meshStandardMaterial color="#202733" roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh position={[0, 0.08, 0]} castShadow>
            <coneGeometry args={[0.64, 0.26, 28, 1, true]} />
            <meshStandardMaterial color="#1e3a8a" roughness={0.42} metalness={0.04} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

function FastFoodServerNpc({
  x,
  z,
  phase,
  gender,
}: {
  x: number;
  z: number;
  phase: number;
  gender: ScenicNpcGender;
}): React.JSX.Element {
  const ref = useRef<THREE.Group>(null);
  const profile = useMemo(
    () =>
      createScenicNpcProfile(
        `server-${phase}`,
        gender,
        "server",
        gender === "male" ? "#4a5568" : "#8f3f55",
      ),
    [gender, phase],
  );

  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const t = clock.elapsedTime * 0.36 + phase;
    group.position.x = x + Math.sin(t) * 0.24;
    group.position.z = z + Math.cos(t * 0.7) * 0.12;
    group.rotation.y = Math.PI + Math.sin(t) * 0.08;
  });

  return (
    <group ref={ref} position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <ScenicNpcFigure
        id={`restaurant-server-${gender}-${phase}`}
        pose="idle"
        profile={profile}
        role="server"
        scaleMultiplier={2.42}
      />
    </group>
  );
}

function FastFoodRestaurant({
  x,
  z,
  wetness,
  windowGlow,
  signGlow,
  glowColor,
}: {
  x: number;
  z: number;
  wetness: number;
  windowGlow: number;
  signGlow: number;
  glowColor: THREE.Color;
}): React.JSX.Element {
  const signTexture = useMemo(() => createFastFoodSignTexture(), []);
  const slabGloss = THREE.MathUtils.clamp(wetness * 0.72, 0, 1);
  const windowColor = lerpColor("#8cc7e8", "#9fd1ef", windowGlow * 0.12);
  const wallT = 0.24;
  const frontZ = SOUTH_FASTFOOD_FRONT_Z;
  const backZ = SOUTH_FASTFOOD_BACK_Z;
  const doorLeft = SOUTH_FASTFOOD_DOOR_X - SOUTH_FASTFOOD_DOOR_W / 2;
  const doorRight = SOUTH_FASTFOOD_DOOR_X + SOUTH_FASTFOOD_DOOR_W / 2;
  const minX = -SOUTH_FASTFOOD_W / 2;
  const maxX = SOUTH_FASTFOOD_W / 2;
  const facadeRed = "#b91f18";
  const facadeCream = "#ead8ad";
  const warmWindowGlow = Math.max(windowGlow, 0.72);
  const frontWallPanels = (() => {
    const panels: Array<{ key: string; cx: number; y: number; w: number; h: number }> = [];
    const pushPanel = (key: string, x1: number, x2: number, y: number, h: number): void => {
      if (x2 - x1 < 0.08) return;
      panels.push({ key, cx: (x1 + x2) / 2, y, w: x2 - x1, h });
    };
    pushPanel("front-low-left", minX, doorLeft, 0.58, 1.16);
    pushPanel("front-low-right", doorRight, maxX, 0.58, 1.16);
    pushPanel("front-top", minX, maxX, 2.58, 0.44);

    const holes = [
      [-8.85, -5.95],
      [-5.45, -2.55],
      [doorLeft, doorRight],
      [2.55, 5.45],
      [5.95, 8.85],
    ].sort((a, b) => a[0] - b[0]);
    let cursor = minX;
    holes.forEach(([start, end], index) => {
      pushPanel(`front-mid-${index}`, cursor, start, 1.74, 1.45);
      cursor = Math.max(cursor, end);
    });
    pushPanel("front-mid-tail", cursor, maxX, 1.74, 1.45);
    return panels;
  })();
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[SOUTH_FASTFOOD_W, 0.16, SOUTH_FASTFOOD_D]} />
        <meshStandardMaterial
          color="#d9b067"
          roughness={THREE.MathUtils.lerp(0.88, 0.42, slabGloss)}
          metalness={THREE.MathUtils.lerp(0, 0.12, slabGloss)}
        />
      </mesh>
      {Array.from({ length: 9 }).map((_, index) => (
        <mesh
          key={`ff-floor-plank-${index}`}
          position={[-10.6 + index * 2.65, 0.172, -0.2]}
          receiveShadow
        >
          <boxGeometry args={[0.035, 0.018, SOUTH_FASTFOOD_D - 1.1]} />
          <meshStandardMaterial color="#9b6a2d" roughness={0.82} />
        </mesh>
      ))}
      {Array.from({ length: 5 }).map((_, index) => (
        <mesh
          key={`ff-floor-cross-plank-${index}`}
          position={[0, 0.174, -5.2 + index * 2.55]}
          receiveShadow
        >
          <boxGeometry args={[SOUTH_FASTFOOD_W - 1.1, 0.018, 0.028]} />
          <meshStandardMaterial color="#c98b3c" roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 0.15, frontZ - 0.9]} receiveShadow>
        <boxGeometry args={[22, 0.12, 2.2]} />
        <meshStandardMaterial
          color="#c8d0d8"
          roughness={THREE.MathUtils.lerp(0.84, 0.4, slabGloss)}
          metalness={THREE.MathUtils.lerp(0, 0.1, slabGloss)}
        />
      </mesh>
      <mesh position={[0, 1.6, backZ - wallT / 2]} castShadow receiveShadow>
        <boxGeometry args={[SOUTH_FASTFOOD_W, 3.2, wallT]} />
        <meshStandardMaterial color={facadeCream} roughness={0.82} />
      </mesh>
      <mesh position={[maxX - wallT / 2, 1.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, 3.4, SOUTH_FASTFOOD_D]} />
        <meshStandardMaterial color="#d99a50" roughness={0.86} />
      </mesh>
      <mesh position={[minX + wallT / 2, 1.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, 3.2, SOUTH_FASTFOOD_D]} />
        <meshStandardMaterial color="#d99a50" roughness={0.86} />
      </mesh>
      {frontWallPanels.map((panel) => (
        <mesh
          key={panel.key}
          position={[panel.cx, panel.y, frontZ + wallT / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[panel.w, panel.h, wallT]} />
          <meshStandardMaterial color={facadeCream} roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 2.25, frontZ - 0.055]} castShadow receiveShadow>
        <boxGeometry args={[SOUTH_FASTFOOD_W + 0.1, 0.32, 0.08]} />
        <meshStandardMaterial color={facadeRed} roughness={0.58} emissive="#6b0d0d" emissiveIntensity={signGlow * 0.16} />
      </mesh>
      {[-10.7, -2.15, 2.15, 10.7].map((px) => (
        <mesh key={`ff-red-pillar-${px}`} position={[px, 1.42, frontZ - 0.065]} castShadow receiveShadow>
          <boxGeometry args={[0.28, 2.25, 0.08]} />
          <meshStandardMaterial color={facadeRed} roughness={0.62} />
        </mesh>
      ))}
      <mesh position={[0, 3.05, frontZ - 0.06]} castShadow receiveShadow>
        <boxGeometry args={[SOUTH_FASTFOOD_W, 0.54, 0.08]} />
        <meshStandardMaterial color={facadeRed} roughness={0.58} emissive="#7f1010" emissiveIntensity={signGlow * 0.18} />
      </mesh>
      <mesh position={[0, 3.43, 0]} castShadow receiveShadow>
        <boxGeometry args={[24.8, 0.34, 14.2]} />
        <meshStandardMaterial color={facadeRed} roughness={0.56} />
      </mesh>
      <mesh position={[0, 3.16, 0]} receiveShadow>
        <boxGeometry args={[23.6, 0.08, 13.1]} />
        <meshStandardMaterial color="#e4d4b8" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.44, frontZ + 0.18]} castShadow receiveShadow>
        <boxGeometry args={[19.2, 0.22, 0.54]} />
        <meshStandardMaterial color="#f0c34a" roughness={0.55} />
      </mesh>
      <mesh position={[0, 4.12, frontZ - 0.44]} castShadow receiveShadow>
        <boxGeometry args={[10.8, 1.45, 0.22]} />
        <meshStandardMaterial
          color="#7f1010"
          roughness={0.32}
          emissive="#ff2e1f"
          emissiveIntensity={0.18 + signGlow * 0.46}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 4.12, frontZ - 0.63]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
        <planeGeometry args={[10.2, 1.15]} />
        <meshBasicMaterial
          map={signTexture}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          toneMapped={false}
        />
      </mesh>
      {[-4.9, 4.9].map((sx) => (
        <mesh key={`ff-sign-post-${sx}`} position={[sx, 3.48, frontZ - 0.25]} castShadow receiveShadow>
          <boxGeometry args={[0.16, 1.15, 0.16]} />
          <meshStandardMaterial color="#303640" roughness={0.46} metalness={0.22} />
        </mesh>
      ))}
      <group position={[-8.7, 0, frontZ - 0.12]}>
        <mesh position={[0, 2.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.2, 4.2, 0.34]} />
          <meshStandardMaterial color="#a71914" roughness={0.48} emissive="#5b0d0b" emissiveIntensity={signGlow * 0.18} />
        </mesh>
        <mesh position={[0, 4.65, -0.08]} castShadow receiveShadow>
          <boxGeometry args={[2.72, 0.9, 0.2]} />
          <meshStandardMaterial color="#fff1bd" roughness={0.34} emissive="#ffd86b" emissiveIntensity={0.18 + signGlow * 0.34} toneMapped={false} />
        </mesh>
        <mesh position={[0, 4.65, -0.26]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[2.46, 0.66]} />
          <meshBasicMaterial
            map={signTexture}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            toneMapped={false}
          />
        </mesh>
      </group>
      {[-5.4, 0, 5.4].map((lx) => (
        <group key={`ff-warm-light-${lx}`} position={[lx, 0, -1.2]}>
          <pointLight
            position={[0, 2.86, 0]}
            color="#ffd57a"
            intensity={0.8 + windowGlow * 1.1}
            distance={8.5}
            decay={1.7}
          />
          <mesh position={[0, 2.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.36, 24]} />
            <meshStandardMaterial
              color="#fff1b8"
              emissive="#ffd36a"
              emissiveIntensity={0.65 + windowGlow * 0.5}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {[-7.4, -4.0, 4.0, 7.4].map((wx) => (
        <group key={`ff-window-${wx}`} position={[wx, 1.74, frontZ - 0.1]}>
          <mesh>
            <boxGeometry args={[2.9, 1.45, 0.06]} />
            <meshStandardMaterial
              color={windowColor}
              roughness={THREE.MathUtils.lerp(0.18, 0.08, wetness * 0.6)}
              metalness={THREE.MathUtils.lerp(0.08, 0.2, wetness * 0.6)}
              transparent
              opacity={0.2}
              depthWrite={false}
              emissive={glowColor}
              emissiveIntensity={warmWindowGlow * 0.06}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.18]}>
            <boxGeometry args={[2.48, 1.02, 0.025]} />
            <meshStandardMaterial
              color="#ffe7a3"
              roughness={0.38}
              emissive={glowColor}
              emissiveIntensity={warmWindowGlow * 0.95}
              transparent
              opacity={0.24}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {[0.78, -0.78].map((fy) => (
            <mesh key={`ff-window-hframe-${wx}-${fy}`} position={[0, fy, -0.045]} castShadow receiveShadow>
              <boxGeometry args={[3.12, 0.12, 0.08]} />
              <meshStandardMaterial color="#7a4b2d" roughness={0.58} metalness={0.08} />
            </mesh>
          ))}
          {[-1.5, 1.5].map((fx) => (
            <mesh key={`ff-window-vframe-${wx}-${fx}`} position={[fx, 0, -0.045]} castShadow receiveShadow>
              <boxGeometry args={[0.12, 1.58, 0.08]} />
              <meshStandardMaterial color="#7a4b2d" roughness={0.58} metalness={0.08} />
            </mesh>
          ))}
          <mesh position={[0, 0, -0.075]}>
            <boxGeometry args={[2.76, 1.25, 0.06]} />
            <meshStandardMaterial
              color={windowColor}
              roughness={0.16}
              metalness={0.12}
              transparent
              opacity={0.16}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0, -0.11]} castShadow receiveShadow>
            <boxGeometry args={[0.07, 1.28, 0.07]} />
            <meshStandardMaterial color="#7a4b2d" roughness={0.58} metalness={0.08} />
          </mesh>
        </group>
      ))}
      <FastFoodDoubleDoor
        worldX={x}
        worldZ={z}
        localFrontZ={frontZ}
        windowColor={windowColor}
        wetness={wetness}
      />
      <group position={[0, 0, backZ - 2.05]}>
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
          <boxGeometry args={[10.8, 1.08, 0.92]} />
          <meshStandardMaterial color="#8a4f2b" roughness={0.72} />
        </mesh>
        <mesh position={[0, 1.36, -0.35]} castShadow receiveShadow>
          <boxGeometry args={[10.4, 0.18, 0.42]} />
          <meshStandardMaterial color="#f0c34a" roughness={0.48} />
        </mesh>
        {[-3.2, 0, 3.2].map((mx) => (
          <mesh key={`ff-menu-${mx}`} position={[mx, 2.58, 0.55]} castShadow receiveShadow>
            <boxGeometry args={[2.42, 0.9, 0.08]} />
            <meshStandardMaterial
              color="#1f2937"
              roughness={0.36}
              emissive="#0ea5e9"
              emissiveIntensity={windowGlow * 0.28}
              toneMapped={false}
            />
          </mesh>
        ))}
        {[-4.4, 4.4].map((kx) => (
          <mesh key={`ff-kitchen-station-${kx}`} position={[kx, 1.18, 1.02]} castShadow receiveShadow>
            <boxGeometry args={[1.18, 1.55, 0.7]} />
            <meshStandardMaterial color="#f4efe3" roughness={0.46} metalness={0.12} />
          </mesh>
        ))}
        <mesh position={[0, 1.08, 1.08]} castShadow receiveShadow>
          <boxGeometry args={[2.3, 1.28, 0.62]} />
          <meshStandardMaterial color="#b91f18" roughness={0.5} metalness={0.08} />
        </mesh>
        <mesh position={[0, 1.78, 0.72]} castShadow receiveShadow>
          <boxGeometry args={[6.4, 0.12, 0.12]} />
          <meshStandardMaterial color="#ffd166" roughness={0.36} emissive="#ffd166" emissiveIntensity={windowGlow * 0.35} toneMapped={false} />
        </mesh>
      </group>
      <FastFoodServerNpc x={-2.2} z={backZ - 3.4} phase={0.2} gender="female" />
      <FastFoodServerNpc x={2.4} z={backZ - 3.2} phase={2.4} gender="male" />
      {[
        [-4.8, -2.3],
        [0, -2.65],
        [4.8, -2.3],
      ].map(([tx, tz]) => (
        <group key={`ff-table-${tx}-${tz}`} position={[tx, 0, tz]}>
          <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.62, 0.68, 0.12, 20]} />
            <meshStandardMaterial color="#f4d28b" roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.08, 0.1, 0.54, 12]} />
            <meshStandardMaterial color="#3d4652" roughness={0.46} metalness={0.24} />
          </mesh>
          {[
            [0, 0.82],
            [0, -0.82],
          ].map(([cx2, cz2]) => (
            <mesh key={`ff-chair-${tx}-${tz}-${cz2}`} position={[cx2, 0.35, cz2]} castShadow receiveShadow>
              <boxGeometry args={[0.82, 0.42, 0.62]} />
              <meshStandardMaterial color="#c7352f" roughness={0.72} />
            </mesh>
          ))}
        </group>
      ))}
      {[-7.4, 7.4].map((bx) => (
        <group key={`ff-booth-${bx}`} position={[bx, 0, 1.2]}>
          <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.92, 0.28, 1.24]} />
            <meshStandardMaterial color="#d64545" roughness={0.74} />
          </mesh>
          <mesh position={[0, 0.82, 0.62]} castShadow receiveShadow>
            <boxGeometry args={[1.92, 0.86, 0.22]} />
            <meshStandardMaterial color="#d64545" roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.48, -0.54]} castShadow receiveShadow>
            <boxGeometry args={[1.72, 0.2, 0.86]} />
            <meshStandardMaterial color="#f4d28b" roughness={0.66} />
          </mesh>
        </group>
      ))}
      {[-9.2, 9.2].map((sx) => (
        <group key={`ff-shrub-${sx}`} position={[sx, 0, 4.6]}>
          <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 0.56, 1.1]} />
            <meshStandardMaterial color="#8f99a5" roughness={0.84} />
          </mesh>
          <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.7, 0.52, 0.72]} />
            <meshStandardMaterial color="#6d9458" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function resolveStreetPedestrianPose({
  start,
  end,
  elapsed,
  phase,
  crossesRoad = false,
  observer,
}: {
  start: [number, number];
  end: [number, number];
  elapsed: number;
  phase: number;
  crossesRoad?: boolean;
  observer?: StreetObserverPosition;
}): {
  x: number;
  z: number;
  rotationY: number;
  walking: boolean;
  visible: boolean;
} {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const distance = Math.hypot(dx, dz);
  const duration = Math.max(
    distance / STREET_NPC_WALK_SPEED,
    18 + phase * 1.4,
  );
  const cycleDuration =
    duration + STREET_NPC_EXIT_HOLD_S + STREET_NPC_RESET_HOLD_S;
  const cycleTime = (elapsed + phase * 5.3) % cycleDuration;
  const routeSpeed = distance / duration;
  let t = 0;
  let visible = true;
  let walking =
    routeSpeed > STREET_NPC_MIN_WALK_SPEED && cycleTime <= duration;

  if (cycleTime <= duration) {
    t = duration > 0 ? cycleTime / duration : 0;
  } else if (cycleTime <= duration + STREET_NPC_EXIT_HOLD_S) {
    t = 1;
    walking = false;
  } else {
    const observerNearStart = observer
      ? Math.hypot(observer.x - start[0], observer.z - start[1]) <
        STREET_NPC_OBSERVER_RESPAWN_CLEARANCE
      : false;
    const observerNearEnd = observer
      ? Math.hypot(observer.x - end[0], observer.z - end[1]) <
        STREET_NPC_OBSERVER_RESPAWN_CLEARANCE
      : false;
    if (observerNearStart || observerNearEnd) {
      t = 1;
      walking = false;
    } else {
      t = 0;
      walking = false;
      visible = false;
    }
  }

  const signalStopActive = elapsed % SOUTH_SIGNAL_CYCLE_S < SOUTH_SIGNAL_STOP_S;
  if (crossesRoad && !signalStopActive && t > 0.22 && t < 0.72) {
    t = 0.22;
    walking = false;
  }

  const x = THREE.MathUtils.lerp(start[0], end[0], t);
  const z = THREE.MathUtils.lerp(start[1], end[1], t);
  const rotationY = Math.atan2(dx, dz);
  return {
    x,
    z,
    rotationY,
    walking,
    visible,
  };
}

function streetRouteDistance(route: Pick<StreetPedestrianRoute, "start" | "end">): number {
  return Math.hypot(route.end[0] - route.start[0], route.end[1] - route.start[1]);
}

function pointInsideStreetEntryAvoidance([x, z]: [number, number]): boolean {
  return (
    x >= STREET_NPC_ENTRY_AVOIDANCE_ZONE.minX &&
    x <= STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxX &&
    z >= STREET_NPC_ENTRY_AVOIDANCE_ZONE.minZ &&
    z <= STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxZ
  );
}

function routeCrossesStreetEntryAvoidance({
  start,
  end,
}: Pick<StreetPedestrianRoute, "start" | "end">): boolean {
  if (pointInsideStreetEntryAvoidance(start) || pointInsideStreetEntryAvoidance(end)) {
    return true;
  }

  if (start[0] === end[0]) {
    const minZ = Math.min(start[1], end[1]);
    const maxZ = Math.max(start[1], end[1]);
    return (
      start[0] >= STREET_NPC_ENTRY_AVOIDANCE_ZONE.minX &&
      start[0] <= STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxX &&
      maxZ >= STREET_NPC_ENTRY_AVOIDANCE_ZONE.minZ &&
      minZ <= STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxZ
    );
  }

  if (start[1] === end[1]) {
    const minX = Math.min(start[0], end[0]);
    const maxX = Math.max(start[0], end[0]);
    return (
      start[1] >= STREET_NPC_ENTRY_AVOIDANCE_ZONE.minZ &&
      start[1] <= STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxZ &&
      maxX >= STREET_NPC_ENTRY_AVOIDANCE_ZONE.minX &&
      minX <= STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxX
    );
  }

  return Array.from({ length: 17 }).some((_, index) => {
    const t = index / 16;
    return pointInsideStreetEntryAvoidance([
      THREE.MathUtils.lerp(start[0], end[0], t),
      THREE.MathUtils.lerp(start[1], end[1], t),
    ]);
  });
}

export function isStreetPedestrianRouteAllowed(route: StreetPedestrianRoute): boolean {
  return (
    streetRouteDistance(route) >= STREET_NPC_MIN_ROUTE_DISTANCE &&
    !routeCrossesStreetEntryAvoidance(route)
  );
}

export function createStreetPedestrianRoutes(): StreetPedestrianRoute[] {
  const restaurantFrontZ = SOUTH_FASTFOOD_CENTRE_Z + SOUTH_FASTFOOD_FRONT_Z;
  const southSidewalkZ = ROAD_SOUTH_Z + ROAD_WIDTH / 2 + 1.35;
  const northSidewalkZ = ROAD_SOUTH_Z - ROAD_WIDTH / 2 - 1.25;
  const westCrossingX = -28;
  const routes: StreetPedestrianRoute[] = [
    {
      start: [-48, southSidewalkZ],
      end: [-20, southSidewalkZ],
      gender: "male",
      topColor: "#3f5f8a",
    },
    {
      start: [20, southSidewalkZ],
      end: [48, southSidewalkZ],
      gender: "female",
      topColor: "#8a5167",
    },
    {
      start: [-46, northSidewalkZ],
      end: [-18, northSidewalkZ],
      gender: "female",
      topColor: "#64748b",
    },
    {
      start: [18, northSidewalkZ],
      end: [46, northSidewalkZ],
      gender: "male",
      topColor: "#40586f",
    },
    {
      start: [-13, restaurantFrontZ - 1.35],
      end: [13.5, restaurantFrontZ - 1.35],
      gender: "male",
      topColor: "#4f6f5d",
    },
    {
      start: [-16, SOUTH_PARKING_MAX_Z + 1.45],
      end: [16, SOUTH_PARKING_MAX_Z + 1.45],
      gender: "female",
      topColor: "#6d5b8f",
    },
    {
      start: [westCrossingX, northSidewalkZ - 8],
      end: [westCrossingX, southSidewalkZ + 8],
      gender: "male",
      topColor: "#8a6a3f",
      cross: true,
    },
  ];

  return routes.filter(isStreetPedestrianRouteAllowed);
}

function StreetPedestrian({
  start,
  end,
  phase,
  profile,
  umbrella,
  crossesRoad = false,
}: {
  start: [number, number];
  end: [number, number];
  phase: number;
  profile: AgentAvatarProfile;
  umbrella: boolean;
  crossesRoad?: boolean;
}): React.JSX.Element {
  const ref = useRef<THREE.Group>(null);
  const poseRef = useRef<ScenicNpcPose>("walking");

  useFrame(({ clock, camera }) => {
    const group = ref.current;
    if (!group) return;
    const playerPosition = camera.userData.aimashiPlayerPosition as
      | { x: number; z: number }
      | undefined;
    const pose = resolveStreetPedestrianPose({
      start,
      end,
      elapsed: clock.elapsedTime,
      phase,
      crossesRoad,
      observer: playerPosition ?? { x: camera.position.x, z: camera.position.z },
    });
    group.position.set(pose.x, 0, pose.z);
    group.rotation.y = pose.rotationY;
    group.visible = pose.visible;
    poseRef.current = pose.walking ? "walking" : "idle";
  });

  return (
    <group ref={ref} position={[start[0], 0, start[1]]}>
      <ScenicNpcFigure
        id={`street-pedestrian-${profile.seed}`}
        pose="walking"
        poseRef={poseRef}
        profile={profile}
        role="pedestrian"
        umbrella={umbrella}
        scaleMultiplier={2.5}
      />
    </group>
  );
}

function StreetPedestrians({
  world,
  rainStrength,
}: {
  world: WorldSceneState;
  rainStrength: number;
}): React.JSX.Element | null {
  void world;
  const rainy = rainStrength > 0.18;
  const paths = useMemo(createStreetPedestrianRoutes, []);

  return (
    <group>
      {paths.map((path, index) => {
        const profile = createScenicNpcProfile(
          `pedestrian-${index}`,
          path.gender,
          "pedestrian",
          path.topColor,
        );
        return (
          <StreetPedestrian
            key={`street-pedestrian-${index}`}
            start={path.start}
            end={path.end}
            phase={index * 1.37 + 0.4}
            profile={profile}
            umbrella={rainy}
            crossesRoad={path.cross}
          />
        );
      })}
    </group>
  );
}

function SouthGateSignalHead({
  x,
  z,
  rotY,
}: {
  x: number;
  z: number;
  rotY: number;
}): React.JSX.Element {
  const redRef = useRef<THREE.MeshStandardMaterial>(null);
  const greenRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const stopActive =
      clock.getElapsedTime() % SOUTH_SIGNAL_CYCLE_S < SOUTH_SIGNAL_STOP_S;
    if (redRef.current) {
      redRef.current.emissiveIntensity = stopActive ? 1.9 : 0.08;
    }
    if (greenRef.current) {
      greenRef.current.emissiveIntensity = stopActive ? 0.08 : 1.55;
    }
  });

  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1.65, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 3.1, 10]} />
        <meshStandardMaterial
          color="#3a414b"
          roughness={0.62}
          metalness={0.12}
        />
      </mesh>
      <mesh position={[0.16, 2.52, 0]} castShadow>
        <boxGeometry args={[0.52, 0.94, 0.28]} />
        <meshStandardMaterial
          color="#1b2028"
          roughness={0.38}
          metalness={0.18}
        />
      </mesh>
      <mesh position={[0.16, 2.73, 0.15]}>
        <sphereGeometry args={[0.11, 18, 16]} />
        <meshStandardMaterial
          ref={redRef}
          color="#ff6767"
          emissive="#ff3b30"
          emissiveIntensity={0.08}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0.16, 2.34, 0.15]}>
        <sphereGeometry args={[0.11, 18, 16]} />
        <meshStandardMaterial
          ref={greenRef}
          color="#7ff5a3"
          emissive="#22c55e"
          emissiveIntensity={1.55}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.16, 12]} />
        <meshStandardMaterial color="#68717d" roughness={0.72} />
      </mesh>
    </group>
  );
}

function SouthGateParkingLot({
  visuals,
}: {
  visuals: CityBackdropWorldVisuals;
}): React.JSX.Element {
  const curbColor = visuals.parkingCurbColor;
  const lotColor = visuals.parkingColor;
  const stripeColor = visuals.parkingPaintColor;
  const borderColor = visuals.parkingBorderColor;
  const signBlue = "#2f6fe4";
  const northRowZ = SOUTH_PARKING_MIN_Z + 2.35;
  const southRowZ = SOUTH_PARKING_MAX_Z - 2.35;
  const centerWalkW = 4.2;
  const leftCols = [-12.2, -8.4];
  const rightCols = [8.4, 12.2];
  const slotXs = [...leftCols, ...rightCols];
  const rearStreetZ = SOUTH_PARKING_MAX_Z + 1.7;
  const parkingPoleX = SOUTH_PARKING_MAX_X + 2.2;
  const parkingPoleZ = SOUTH_PARKING_CENTRE_Z - 0.4;
  const chargerFrontOffset = 3.12;
  const restaurantZ = SOUTH_FASTFOOD_CENTRE_Z;
  const lotRoughness = THREE.MathUtils.lerp(0.94, 0.3, visuals.parkingGloss);
  const lotMetalness = THREE.MathUtils.lerp(0.02, 0.22, visuals.parkingGloss);
  const walkRoughness = THREE.MathUtils.lerp(0.82, 0.34, visuals.parkingGloss);
  const walkMetalness = THREE.MathUtils.lerp(0.02, 0.12, visuals.parkingGloss);
  const paintRoughness = THREE.MathUtils.lerp(
    0.72,
    0.26,
    visuals.parkingGloss * 0.72,
  );
  const rainStrength =
    visuals.wetness > 0.5 ? THREE.MathUtils.clamp(visuals.wetness, 0, 1) : 0;

  return (
    <group>
      <ParkingCanopy
        x={-10.3}
        z={northRowZ + 1.42}
        width={7.6}
        depth={5.8}
        visuals={visuals}
      />
      <ParkingCanopy
        x={8.4}
        z={southRowZ - 1.42}
        width={7.6}
        depth={5.8}
        visuals={visuals}
      />
      <mesh position={[0, 0.004, SOUTH_PARKING_CENTRE_Z]} receiveShadow>
        <boxGeometry args={[SOUTH_PARKING_W, 0.018, SOUTH_PARKING_D]} />
        <meshStandardMaterial
          color={lotColor}
          roughness={lotRoughness}
          metalness={lotMetalness}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <ParkingRainRipples strength={rainStrength} />
      <mesh position={[0, 0.012, SOUTH_PARKING_MIN_Z - 0.92]} receiveShadow>
        <boxGeometry args={[SOUTH_PARKING_W + 1.4, 0.024, 1.84]} />
        <meshStandardMaterial
          color={visuals.parkingWalkColor}
          roughness={walkRoughness}
          metalness={walkMetalness}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh position={[0, 0.016, SOUTH_PARKING_CENTRE_Z]} receiveShadow>
        <boxGeometry args={[centerWalkW, 0.022, SOUTH_PARKING_D - 0.9]} />
        <meshStandardMaterial
          color={visuals.parkingWalkColor}
          roughness={walkRoughness}
          metalness={walkMetalness}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh position={[0, 0.018, SOUTH_PARKING_CENTRE_Z]} receiveShadow>
        <boxGeometry args={[0.1, 0.024, SOUTH_PARKING_D - 1.1]} />
        <meshStandardMaterial
          color={borderColor}
          roughness={paintRoughness}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh position={[0, 0.018, SOUTH_PARKING_MIN_Z + 4.82]} receiveShadow>
        <boxGeometry args={[SOUTH_PARKING_W - 1.2, 0.022, 0.08]} />
        <meshStandardMaterial
          color={borderColor}
          roughness={paintRoughness}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh position={[0, 0.018, SOUTH_PARKING_MAX_Z - 4.82]} receiveShadow>
        <boxGeometry args={[SOUTH_PARKING_W - 1.2, 0.022, 0.08]} />
        <meshStandardMaterial
          color={borderColor}
          roughness={paintRoughness}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {[-10.3, 10.3].map((px) => (
        <group
          key={`parking-ground-p-${px}`}
          position={[px, 0, SOUTH_PARKING_CENTRE_Z]}
        >
          <mesh
            position={[0, 0.019, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[1.7, 1.7]} />
            <meshStandardMaterial
              color={signBlue}
              roughness={THREE.MathUtils.lerp(
                0.7,
                0.34,
                visuals.parkingGloss * 0.55,
              )}
              metalness={THREE.MathUtils.lerp(
                0,
                0.08,
                visuals.parkingGloss * 0.4,
              )}
            />
          </mesh>
          <mesh position={[0, 0.026, 0]} receiveShadow>
            <boxGeometry args={[0.28, 0.024, 1.05]} />
            <meshStandardMaterial color="#f8fbff" roughness={paintRoughness} />
          </mesh>
          <mesh position={[0.22, 0.026, 0.29]} receiveShadow>
            <boxGeometry args={[0.44, 0.024, 0.26]} />
            <meshStandardMaterial color="#f8fbff" roughness={paintRoughness} />
          </mesh>
          <mesh position={[0.22, 0.026, -0.29]} receiveShadow>
            <boxGeometry args={[0.44, 0.024, 0.26]} />
            <meshStandardMaterial color="#f8fbff" roughness={paintRoughness} />
          </mesh>
        </group>
      ))}
      {slotXs
        .flatMap((x) => [
          [x, northRowZ, 0],
          [x, southRowZ, Math.PI],
        ])
        .map(([x, z, rotY]) => (
          <group
            key={`${x}-${z}`}
            position={[x as number, 0, z as number]}
            rotation={[0, rotY as number, 0]}
          >
            <mesh position={[0, 0.018, 0]} receiveShadow>
              <boxGeometry args={[2.75, 0.024, 0.08]} />
              <meshStandardMaterial
                color={stripeColor}
                roughness={paintRoughness}
              />
            </mesh>
            <mesh position={[-1.38, 0.018, 2.06]} receiveShadow>
              <boxGeometry args={[0.08, 0.024, 4.1]} />
              <meshStandardMaterial
                color={stripeColor}
                roughness={paintRoughness}
              />
            </mesh>
            <mesh position={[1.38, 0.018, 2.06]} receiveShadow>
              <boxGeometry args={[0.08, 0.024, 4.1]} />
              <meshStandardMaterial
                color={stripeColor}
                roughness={paintRoughness}
              />
            </mesh>
            <mesh position={[0, 0.11, 3.76]} receiveShadow>
              <boxGeometry args={[1.5, 0.08, 0.14]} />
              <meshStandardMaterial color={curbColor} roughness={0.82} />
            </mesh>
          </group>
        ))}
      <Suspense fallback={null}>
        <ParkedCar
          x={-12.2}
          z={northRowZ + 1.82}
          rotY={Math.PI}
          url={car2GlbUrl}
          tint="#f5f7fa"
          rainStrength={rainStrength}
        />
        <ParkedCar
          x={-8.4}
          z={northRowZ + 1.82}
          rotY={Math.PI}
          url={car2GlbUrl}
          tint={DRIVABLE_PARKED_CAR.tint}
          rainStrength={rainStrength}
          drivableVehicle={DRIVABLE_PARKED_CAR}
        />
        <ParkedCar
          x={8.4}
          z={northRowZ + 1.82}
          rotY={Math.PI}
          url={car1GlbUrl}
          tint="#aeb6bf"
          rainStrength={rainStrength}
        />
        <ParkedCar
          x={8.4}
          z={southRowZ - 1.82}
          rotY={0}
          url={car1GlbUrl}
          tint="#76d7c4"
          rainStrength={rainStrength}
        />
        <RotatingParkedCar
          x={-12.2}
          z={southRowZ - 1.82}
          rotY={0}
          url={car1GlbUrl}
          tint="#39414f"
          rainStrength={rainStrength}
          phase={8.5}
        />
        <RotatingParkedCar
          x={12.2}
          z={southRowZ - 1.82}
          rotY={0}
          url={car2GlbUrl}
          tint="#239b56"
          rainStrength={rainStrength}
          phase={21.2}
        />
      </Suspense>
      {[
        [-12.2, northRowZ + chargerFrontOffset, -11.42, northRowZ + 1.98, 0],
        [-8.4, northRowZ + chargerFrontOffset, -7.62, northRowZ + 1.98, 0],
        [8.4, northRowZ + chargerFrontOffset, 9.18, northRowZ + 1.98, 0],
        [
          8.4,
          southRowZ - chargerFrontOffset,
          9.18,
          southRowZ - 1.98,
          Math.PI,
        ],
      ].map(([chargerX, chargerZ, carX, carZ, rotY]) => (
        <EvCharger
          key={`ev-charger-${chargerX}-${chargerZ}`}
          x={chargerX as number}
          z={chargerZ as number}
          rotY={rotY as number}
          cableTo={[carX as number, carZ as number]}
        />
      ))}
      <group position={[parkingPoleX, 0, parkingPoleZ]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 2.4, 10]} />
          <meshStandardMaterial
            color="#586270"
            roughness={0.74}
            metalness={0.1}
          />
        </mesh>
        <mesh position={[0, 2.08, 0.01]} castShadow receiveShadow>
          <boxGeometry args={[1.2, 1.2, 0.1]} />
          <meshStandardMaterial
            color={signBlue}
            roughness={0.44}
            metalness={0.08}
            emissive="#a7c8ff"
            emissiveIntensity={visuals.restaurantSignGlow * 0.08}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 2.08, 0.07]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.66, 0.04]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        <mesh position={[0.18, 2.08, 0.07]} castShadow receiveShadow>
          <boxGeometry args={[0.32, 0.16, 0.04]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        <mesh position={[0.18, 2.27, 0.07]} castShadow receiveShadow>
          <boxGeometry args={[0.32, 0.16, 0.04]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.08, 0]} receiveShadow>
          <cylinderGeometry args={[0.22, 0.26, 0.16, 12]} />
          <meshStandardMaterial color="#7d8794" roughness={0.78} />
        </mesh>
      </group>
      <mesh position={[0, 0.018, rearStreetZ]} receiveShadow>
        <boxGeometry args={[SOUTH_PARKING_W - 1.8, 0.024, 0.14]} />
        <meshStandardMaterial color={borderColor} roughness={paintRoughness} />
      </mesh>
      {[-11.5, -4.2, 4.2, 11.5].map((x) => (
        <group key={`rear-bollard-${x}`} position={[x, 0, rearStreetZ]}>
          <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.09, 0.1, 0.68, 10]} />
            <meshStandardMaterial color="#5f6772" roughness={0.76} />
          </mesh>
          <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color="#b6bec8" roughness={0.66} />
          </mesh>
        </group>
      ))}
      {[-7.4, 7.4].map((x) => (
        <group key={`rear-bench-${x}`} position={[x, 0, rearStreetZ + 0.92]}>
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.1, 0.12, 0.42]} />
            <meshStandardMaterial color="#7c5738" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.7, -0.16]} castShadow receiveShadow>
            <boxGeometry args={[2.1, 0.52, 0.12]} />
            <meshStandardMaterial color="#7c5738" roughness={0.82} />
          </mesh>
          {[-0.82, 0.82].map((lx) => (
            <mesh key={lx} position={[lx, 0.22, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.1, 0.44, 0.36]} />
              <meshStandardMaterial
                color="#46505b"
                roughness={0.7}
                metalness={0.12}
              />
            </mesh>
          ))}
        </group>
      ))}
      {[-12.4, 12.4].map((x) => (
        <group key={`rear-planter-${x}`} position={[x, 0, rearStreetZ + 1.78]}>
          <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.1, 0.56, 0.9]} />
            <meshStandardMaterial color="#8e949c" roughness={0.86} />
          </mesh>
          <mesh position={[0, 0.63, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.7, 0.52, 0.62]} />
            <meshStandardMaterial color="#6b8f57" roughness={0.96} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, rearStreetZ + 1.78]}>
        <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.1, 0.32, 1.0]} />
          <meshStandardMaterial color="#737d8a" roughness={0.72} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.25, 1.25, 0.58]} />
          <meshStandardMaterial color="#f5f7fb" roughness={0.42} metalness={0.08} />
        </mesh>
        <mesh position={[0, 1.62, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.55, 0.22, 0.72]} />
          <meshStandardMaterial color={signBlue} roughness={0.38} emissive="#5ba7ff" emissiveIntensity={visuals.restaurantSignGlow * 0.18} toneMapped={false} />
        </mesh>
        <mesh position={[-0.45, 0.98, -0.32]} castShadow receiveShadow>
          <boxGeometry args={[0.72, 0.72, 0.08]} />
          <meshStandardMaterial color={signBlue} roughness={0.36} emissive="#5ba7ff" emissiveIntensity={visuals.restaurantSignGlow * 0.12} toneMapped={false} />
        </mesh>
        <mesh position={[-0.45, 0.98, -0.38]} castShadow receiveShadow>
          <boxGeometry args={[0.12, 0.44, 0.05]} />
          <meshStandardMaterial color="#ffffff" roughness={0.48} />
        </mesh>
        <mesh position={[-0.28, 0.98, -0.38]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.11, 0.05]} />
          <meshStandardMaterial color="#ffffff" roughness={0.48} />
        </mesh>
        {[0.42, 0.84].map((px) => (
          <mesh key={`ev-hub-post-${px}`} position={[px, 0.82, -0.34]} castShadow receiveShadow>
            <boxGeometry args={[0.18, 0.92, 0.12]} />
            <meshStandardMaterial color="#334155" roughness={0.54} metalness={0.18} />
          </mesh>
        ))}
      </group>
      <FastFoodRestaurant
        x={0}
        z={restaurantZ}
        wetness={visuals.wetness}
        windowGlow={visuals.restaurantWindowGlow}
        signGlow={visuals.restaurantSignGlow}
        glowColor={visuals.windowGlowColor}
      />
      <SouthGateSignalHead
        x={-3.15}
        z={ROAD_SOUTH_Z - ROAD_WIDTH / 2 - 0.9}
        rotY={Math.PI / 2}
      />
      <SouthGateSignalHead
        x={3.15}
        z={ROAD_SOUTH_Z + ROAD_WIDTH / 2 + 0.9}
        rotY={-Math.PI / 2}
      />
    </group>
  );
}

/**
 * Distant low-poly skyline ring — silhouette towers scattered in a wide band
 * outside the detailed backdrop lot, so the horizon reads as a city that
 * keeps going (GTA-style layering: crisp lot → hazy mid-distance towers →
 * sky). One instanced draw call; fog does the atmospheric blending.
 */
const SKYLINE_COUNT = 82;
const SKYLINE_UP = new THREE.Vector3(0, 1, 0);
const NYC_OUTER_MIN = -26;
const NYC_OUTER_MAX = 25;
const NYC_INNER_CLEAR = 52.5;
const NYC_BUILDING_DENSITY = 0.52;

export const DistantSkyline = memo(
  function DistantSkyline(): React.JSX.Element {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    useLayoutEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const color = new THREE.Color();
      for (let i = 0; i < SKYLINE_COUNT; i++) {
        const angle = seededRandom(i * 3 + 1) * Math.PI * 2;
        const radius = 145 + Math.pow(seededRandom(i * 3 + 2), 0.82) * 220;
        const w = 3.5 + seededRandom(i * 3 + 3) * 6.5;
        const d = 3.5 + seededRandom(i * 5 + 4) * 6.5;
        const h = 14 + seededRandom(i * 7 + 5) * 26 + (radius - 145) * 0.035;
        quat.setFromAxisAngle(SKYLINE_UP, seededRandom(i * 11 + 6) * Math.PI);
        pos.set(
          Math.cos(angle) * radius,
          h / 2 - 0.1,
          Math.sin(angle) * radius,
        );
        scl.set(w, h, d);
        matrix.compose(pos, quat, scl);
        mesh.setMatrixAt(i, matrix);
        const skylineHues = [205, 216, 34, 24] as const;
        const hue =
          skylineHues[
            Math.floor(seededRandom(i * 19 + 8) * skylineHues.length)
          ];
        color.setHSL(
          hue / 360,
          0.08 + seededRandom(i * 17 + 9) * 0.06,
          0.34 + seededRandom(i * 13 + 7) * 0.16,
        );
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, []);

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, SKYLINE_COUNT]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.95} metalness={0.05} />
      </instancedMesh>
    );
  },
);

interface BoxBuilding {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

const BOX_BUILDING_STYLES = [
  { hue: 36, sat: 10, lightMin: 49, lightMax: 61 },
  { hue: 28, sat: 13, lightMin: 43, lightMax: 55 },
  { hue: 208, sat: 12, lightMin: 38, lightMax: 52 },
  { hue: 218, sat: 9, lightMin: 31, lightMax: 43 },
  { hue: 44, sat: 7, lightMin: 56, lightMax: 66 },
] as const;
const BOX_BUILDING_FLOOR_H = 1.42;

function getBoxBuildingColor(seed: number): string {
  const style =
    BOX_BUILDING_STYLES[
      Math.floor(seededRandom(seed + 41) * BOX_BUILDING_STYLES.length)
    ];
  const lightness =
    style.lightMin +
    seededRandom(seed + 4) * (style.lightMax - style.lightMin);
  return `hsl(${style.hue}, ${style.sat}%, ${lightness}%)`;
}

function getBoxBuildingFloorCount(seed: number, x: number, z: number): number {
  const distance = Math.hypot(x, z);
  if (distance < 76) {
    return 4 + Math.floor(seededRandom(seed + 53) * 9);
  }

  if (distance < 112) {
    const midRise = seededRandom(seed + 59) > 0.78;
    return midRise
      ? 15 + Math.floor(seededRandom(seed + 61) * 8)
      : 7 + Math.floor(seededRandom(seed + 63) * 8);
  }

  const farTower = seededRandom(seed + 67) > 0.94;
  return farTower
    ? 22 + Math.floor(seededRandom(seed + 71) * 7)
    : 9 + Math.floor(seededRandom(seed + 73) * 10);
}

function getBoxBuildingHeight(seed: number, x: number, z: number): number {
  const floors = getBoxBuildingFloorCount(seed, x, z);
  const parapet = 0.25 + seededRandom(seed + 79) * 0.45;
  return floors * BOX_BUILDING_FLOOR_H + parapet;
}

interface GlbBuilding {
  id: string;
  x: number;
  z: number;
  footprint: number;
  rotY: number;
  url: string;
}

interface BackdropTree {
  x: number;
  z: number;
  h: number;
}

const BoxBuildingWindowLights = memo(function BoxBuildingWindowLights({
  buildings,
  moved,
  glowColor,
  opacity,
}: {
  buildings: BoxBuilding[];
  moved?: Record<string, [number, number, number]>;
  glowColor: THREE.Color;
  opacity: number;
}): React.JSX.Element {
  const frontBackRef = useRef<THREE.InstancedMesh>(null);
  const sideRef = useRef<THREE.InstancedMesh>(null);
  const count = buildings.length * 2;

  useLayoutEffect(() => {
    const frontBackMesh = frontBackRef.current;
    const sideMesh = sideRef.current;
    if (!frontBackMesh || !sideMesh) return;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let index = 0;

    for (const building of buildings) {
      const mv = moved?.[building.id];
      const x = mv ? mv[0] : building.x;
      const z = mv ? mv[2] : building.z;
      const y = building.h * 0.52;

      quat.identity();
      scale.set(building.w * 0.58, building.h * 0.68, 1);
      pos.set(x, y, z + building.d / 2 + BOX_WINDOW_EPSILON);
      matrix.compose(pos, quat, scale);
      frontBackMesh.setMatrixAt(index++, matrix);

      quat.setFromAxisAngle(up, Math.PI);
      pos.set(x, y, z - building.d / 2 - BOX_WINDOW_EPSILON);
      matrix.compose(pos, quat, scale);
      frontBackMesh.setMatrixAt(index++, matrix);
    }

    index = 0;
    for (const building of buildings) {
      const mv = moved?.[building.id];
      const x = mv ? mv[0] : building.x;
      const z = mv ? mv[2] : building.z;
      const y = building.h * 0.52;

      quat.setFromAxisAngle(up, Math.PI / 2);
      scale.set(building.d * 0.58, building.h * 0.68, 1);
      pos.set(x + building.w / 2 + BOX_WINDOW_EPSILON, y, z);
      matrix.compose(pos, quat, scale);
      sideMesh.setMatrixAt(index++, matrix);

      quat.setFromAxisAngle(up, -Math.PI / 2);
      pos.set(x - building.w / 2 - BOX_WINDOW_EPSILON, y, z);
      matrix.compose(pos, quat, scale);
      sideMesh.setMatrixAt(index++, matrix);
    }

    frontBackMesh.instanceMatrix.needsUpdate = true;
    sideMesh.instanceMatrix.needsUpdate = true;
  }, [buildings, moved]);

  return (
    <>
      <instancedMesh
        ref={frontBackRef}
        args={[undefined, undefined, count]}
        geometry={unitWindowPlaneGeo}
        frustumCulled={false}
        renderOrder={3}
      >
        <meshBasicMaterial
          map={boxWindowTexture}
          alphaMap={boxWindowTexture}
          color={glowColor}
          transparent
          opacity={opacity}
          alphaTest={0.12}
          depthWrite={false}
          toneMapped={false}
          side={THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </instancedMesh>
      <instancedMesh
        ref={sideRef}
        args={[undefined, undefined, count]}
        geometry={unitWindowPlaneGeo}
        frustumCulled={false}
        renderOrder={3}
      >
        <meshBasicMaterial
          map={boxWindowTexture}
          alphaMap={boxWindowTexture}
          color={glowColor}
          transparent
          opacity={opacity}
          alphaTest={0.12}
          depthWrite={false}
          toneMapped={false}
          side={THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </instancedMesh>
    </>
  );
});

const GlbBuildingWindowLights = memo(function GlbBuildingWindowLights({
  width,
  depth,
  height,
  center,
  glowColor,
  opacity,
}: {
  width: number;
  depth: number;
  height: number;
  center: THREE.Vector3;
  glowColor: THREE.Color;
  opacity: number;
}): React.JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const windowCenterY = center.y + height * 0.04;

    quat.identity();
    scale.set(width * 0.54, height * 0.62, 1);
    pos.set(center.x, windowCenterY, center.z + depth / 2 + GLB_WINDOW_EPSILON);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(0, matrix);

    quat.setFromAxisAngle(up, Math.PI);
    pos.set(center.x, windowCenterY, center.z - depth / 2 - GLB_WINDOW_EPSILON);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(1, matrix);

    quat.setFromAxisAngle(up, Math.PI / 2);
    scale.set(depth * 0.54, height * 0.62, 1);
    pos.set(center.x + width / 2 + GLB_WINDOW_EPSILON, windowCenterY, center.z);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(2, matrix);

    quat.setFromAxisAngle(up, -Math.PI / 2);
    pos.set(center.x - width / 2 - GLB_WINDOW_EPSILON, windowCenterY, center.z);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(3, matrix);

    mesh.instanceMatrix.needsUpdate = true;
  }, [center, depth, height, width]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, 4]}
      geometry={unitWindowPlaneGeo}
      frustumCulled={false}
      renderOrder={3}
    >
      <meshBasicMaterial
        map={boxWindowTexture}
        alphaMap={boxWindowTexture}
        color={glowColor}
        transparent
        opacity={opacity}
        alphaTest={0.12}
        depthWrite={false}
        toneMapped={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </instancedMesh>
  );
});

function createLakeShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const points = Array.from({ length: 72 }, (_, index) => {
    const t = (index / 72) * Math.PI * 2;
    const ripple =
      1 +
      Math.sin(t * 3.1 + 0.35) * 0.055 +
      Math.sin(t * 5.2 - 0.9) * 0.035;
    return new THREE.Vector2(
      Math.cos(t) * PARK_LAKE.rx * ripple,
      Math.sin(t) * PARK_LAKE.rz * (1 + Math.cos(t * 2.4) * 0.035),
    );
  });
  shape.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) shape.lineTo(point.x, point.y);
  shape.closePath();
  return shape;
}

const LakeRipples = memo(function LakeRipples(): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.children.forEach((child, index) => {
      const pulse = 1 + Math.sin(t * 0.9 + index * 1.2) * 0.012;
      child.scale.set(pulse, pulse, 1);
    });
  });

  return (
    <group ref={groupRef} position={[PARK_LAKE.x, 0.052, PARK_LAKE.z]}>
      {[0.46, 0.63, 0.8, 0.94].map((r, index) => (
        <mesh
          key={`lake-ripple-${r}`}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[PARK_LAKE.rx * r, PARK_LAKE.rz * r, 1]}
          renderOrder={6 + index}
        >
          <ringGeometry args={[0.982, 1, 96]} />
          <meshBasicMaterial
            color="#d8f4ff"
            transparent
            opacity={0.11}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
});

const UrbanLakePark = memo(function UrbanLakePark(): React.JSX.Element {
  const lakeShape = useMemo(createLakeShape, []);
  const grove = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, index) => {
        const t = (index / 18) * Math.PI * 2 + seededRandom(index * 4.7) * 0.18;
        const ring = 0.86 + seededRandom(index * 8.1 + 2) * 0.18;
        return {
          x: PARK_CLEARING.x + Math.cos(t) * PARK_CLEARING.rx * ring,
          z: PARK_CLEARING.z + Math.sin(t) * PARK_CLEARING.rz * ring,
          h: 1.2 + seededRandom(index * 3.9 + 7) * 0.75,
        };
      }),
    [],
  );
  const benches = [
    [-38.2, -29.2, Math.PI / 2],
    [-32.2, -22.7, Math.PI],
    [-26.8, -30.8, -Math.PI / 2],
  ] as const;
  const lamps = [
    [-39.3, -25.2],
    [-35.7, -36.1],
    [-27.3, -25.4],
  ] as const;

  return (
    <group>
      <mesh
        position={[PARK_CLEARING.x, 0.014, PARK_CLEARING.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[PARK_CLEARING.rx + 1.2, PARK_CLEARING.rz + 1.0, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 96]} />
        <meshStandardMaterial
          color="#8fb76f"
          roughness={0.92}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh
        position={[PARK_CLEARING.x, 0.028, PARK_CLEARING.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[PARK_LAKE.rx + 1.18, PARK_LAKE.rz + 1.04, 1]}
        receiveShadow
      >
        <ringGeometry args={[0.78, 1, 112]} />
        <meshStandardMaterial
          color="#d8d1b8"
          roughness={0.78}
          metalness={0.02}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh
        position={[PARK_LAKE.x, 0.042, PARK_LAKE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        renderOrder={5}
      >
        <shapeGeometry args={[lakeShape, 12]} />
        <meshStandardMaterial
          color="#2e89ad"
          roughness={0.18}
          metalness={0.04}
          transparent
          opacity={0.78}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <LakeRipples />
      <mesh position={[PARK_CLEARING.x + 4.6, 0.035, PARK_CLEARING.z + 5.6]} receiveShadow>
        <boxGeometry args={[4.8, 0.035, 1.25]} />
        <meshStandardMaterial color="#c9c0a7" roughness={0.8} />
      </mesh>
      <mesh position={[PARK_CLEARING.x + 4.6, 0.071, PARK_CLEARING.z + 5.6]} receiveShadow>
        <boxGeometry args={[3.8, 0.026, 0.08]} />
        <meshStandardMaterial color="#f5f7fb" roughness={0.62} />
      </mesh>
      {grove.map((tree, index) => (
        <group key={`park-tree-${index}`} position={[tree.x, 0, tree.z]}>
          <mesh position={[0, tree.h * 0.32, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, tree.h * 0.62, 8]} />
            <meshStandardMaterial color="#5b3a24" roughness={0.82} />
          </mesh>
          <mesh position={[0, tree.h * 0.74, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.38 + tree.h * 0.08, 14, 12]} />
            <meshStandardMaterial color="#4d7f33" roughness={0.86} />
          </mesh>
        </group>
      ))}
      {benches.map(([x, z, rot]) => (
        <group key={`park-bench-${x}-${z}`} position={[x, 0, z]} rotation={[0, rot, 0]}>
          <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 0.1, 0.32]} />
            <meshStandardMaterial color="#8a5e3d" roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.58, -0.13]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 0.42, 0.09]} />
            <meshStandardMaterial color="#8a5e3d" roughness={0.82} />
          </mesh>
          {[-0.48, 0.48].map((lx) => (
            <mesh key={lx} position={[lx, 0.16, 0]} castShadow>
              <boxGeometry args={[0.06, 0.3, 0.28]} />
              <meshStandardMaterial color="#3d4752" roughness={0.72} metalness={0.12} />
            </mesh>
          ))}
        </group>
      ))}
      {lamps.map(([x, z]) => (
        <group key={`park-lamp-${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 1.7, 10]} />
            <meshStandardMaterial color="#46515d" roughness={0.65} metalness={0.18} />
          </mesh>
          <mesh position={[0, 1.72, 0]} castShadow>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial
              color="#fff1b8"
              emissive="#ffe8a3"
              emissiveIntensity={0.45}
              roughness={0.42}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/** Deterministic city-block generation around the office / bank / showroom. */
function generateBackdrop(): {
  buildings: BoxBuilding[];
  glbBuildings: GlbBuilding[];
  trees: BackdropTree[];
} {
  const buildings: BoxBuilding[] = [];
  const glbBuildings: GlbBuilding[] = [];
  const trees: BackdropTree[] = [];

  const cell = 5.0;
  const rows = 20;
  const cols = 20;
  const treeRoll = 0.08;
  const buildingRoll = 0.82;
  const detailedBuildingRadius = 62;
  const margin = 2.5;
  const officeW = WORLD_W + margin;
  const officeH = WORLD_H + margin;
  // Also clear the bank lot
  const bankMinZ = BANK_Z - BANK_D / 2 - margin;
  const bankMaxZ = BANK_Z + BANK_D / 2 + margin;
  const bankMinX = BANK_X - BANK_W / 2 - margin;
  const bankMaxX = BANK_X + BANK_W / 2 + margin;
  const rW = ROAD_WIDTH / 2 + 1.5; // half-width + building clearance

  // Plant a jittered tree near a cell centre, capped per street block so no
  // single block turns into a thicket. Used for the random scatter, the open
  // gap cells, and backfilling cells whose building was relocated.
  const treeBox = cell * 5; // ~25u block — the granularity of the per-box cap
  const MAX_TREES_PER_BOX = 5;
  const treesPerBox = new Map<string, number>();
  const plantTree = (cx: number, cz: number, s: number): void => {
    const box = `${Math.floor(cx / treeBox)},${Math.floor(cz / treeBox)}`;
    const n = treesPerBox.get(box) ?? 0;
    if (n >= MAX_TREES_PER_BOX) return;
    treesPerBox.set(box, n + 1);
    trees.push({
      x: cx + (seededRandom(s + 11) - 0.5) * cell * 0.5,
      z: cz + (seededRandom(s + 12) - 0.5) * cell * 0.5,
      h: 1.2 + seededRandom(s + 13) * 1.6,
    });
  };
  const clearRoadFootprint = (
    cx: number,
    cz: number,
    halfX: number,
    halfZ: number,
  ): boolean =>
    ROADS.every((r) =>
      r.axis === "x"
        ? Math.abs(cz - r.center) >= ROAD_WIDTH / 2 + halfZ
        : Math.abs(cx - r.center) >= ROAD_WIDTH / 2 + halfX,
    );

  for (let ix = 0; ix < cols; ix++) {
    for (let iz = 0; iz < rows; iz++) {
      const x = (ix - cols / 2 + 0.5) * cell;
      const z = (iz - rows / 2 + 0.5) * cell;

      // Leave the office lot empty
      if (
        x > -officeW / 2 &&
        x < officeW / 2 &&
        z > -officeH / 2 &&
        z < officeH / 2
      ) {
        continue;
      }

      // Leave the bank lot empty
      if (x > bankMinX && x < bankMaxX && z > bankMinZ && z < bankMaxZ) {
        continue;
      }

      // Leave the showroom lot empty. Margin is wider than the lots above:
      // exclusion tests cell CENTRES, and a building footprint can reach
      // cell * 1.4 / 2 = 3.5 units beyond its centre — with the default
      // 2.5 margin the ±12.5 rows clipped the showroom corners.
      const showroomClear = 6;
      if (
        x > SHOWROOM_X - SHOWROOM_W / 2 - showroomClear &&
        x < SHOWROOM_X + SHOWROOM_W / 2 + showroomClear &&
        z > SHOWROOM_Z - SHOWROOM_D / 2 - showroomClear &&
        z < SHOWROOM_Z + SHOWROOM_D / 2 + showroomClear
      ) {
        continue;
      }

      // Keep the forecourt across the office's south gate open for parking.
      if (
        x > SOUTH_PARKING_MIN_X - 1 &&
        x < SOUTH_PARKING_MAX_X + 1 &&
        z > SOUTH_PARKING_MIN_Z - 1 &&
        z < SOUTH_PARKING_MAX_Z + 1
      ) {
        continue;
      }

      // Reserve the block behind the parking lot for the south-side restaurant.
      if (
        x > SOUTH_FASTFOOD_MIN_X - 2 &&
        x < SOUTH_FASTFOOD_MAX_X + 2 &&
        z > SOUTH_FASTFOOD_MIN_Z - 2 &&
        z < SOUTH_FASTFOOD_MAX_Z + 2
      ) {
        continue;
      }

      // Keep a readable pedestrian / EV-charging corridor between the parking
      // lot and the restaurant instead of letting generated blocks fill it.
      if (
        x > SOUTH_PARKING_MIN_X + 1 &&
        x < SOUTH_PARKING_MAX_X - 1 &&
        z > SOUTH_PARKING_MAX_Z - 0.6 &&
        z < SOUTH_FASTFOOD_MIN_Z + 1
      ) {
        continue;
      }

      // Curated view-corridor cells (see VIEW_BLOCKER_SPOTS)
      if (
        VIEW_BLOCKER_SPOTS.some(
          ([bx, bz]) =>
            Math.abs(x - bx) < cell / 2 && Math.abs(z - bz) < cell / 2,
        )
      ) {
        continue;
      }

      // Keep every road clear, plus the office↔bank connecting street
      const rConnZ = -(WORLD_H / 2 + BANK_STREET_GAP / 2);
      if (
        ROADS.some((r) =>
          r.axis === "x"
            ? Math.abs(z - r.center) < rW
            : Math.abs(x - r.center) < rW,
        )
      )
        continue;
      if (
        z > rConnZ - BANK_STREET_GAP / 2 - 1 &&
        z < rConnZ + BANK_STREET_GAP / 2 + 1 &&
        x > -BANK_W / 2 - 1 &&
        x < BANK_W / 2 + 1
      )
        continue;

      const seed = ix * 100 + iz;
      const roll = seededRandom(seed);

      if (roll < treeRoll && rectIntersectsParkClearing(x, z, cell / 2, cell / 2, 0.85)) {
        continue;
      }

      if (roll < treeRoll) {
        // Random tree in any open cell
        plantTree(x, z, seed);
      } else if (roll < buildingRoll) {
        // Building. Near the office, use a detailed GLB (apartment / building
        // model — cheap and good-looking). Further out, fog hazes the detail,
        // so a flat windowless box at 1 draw call is the efficient choice.
        if (Math.hypot(x, z) < detailedBuildingRadius) {
          const id = `gb:${ix},${iz}`;
          const ov = BACKDROP_OVERRIDES[id];
          const footprint = cell * (0.95 + seededRandom(seed + 6) * 0.45);
          const bx = ov ? ov[0] : x;
          const bz = ov ? ov[1] : z;
          // Only sometimes backfill a vacated cell — the relocated buildings
          // mostly came from one northern strip, so filling every one lined
          // the trees up along that street.
          if (ov && seededRandom(seed + 14) < 0.4) plantTree(x, z, seed);
          if (!clearRoadFootprint(bx, bz, footprint / 2, footprint / 2)) {
            if (seededRandom(seed + 15) < 0.5) plantTree(x, z, seed);
            continue;
          }
          if (rectIntersectsParkClearing(bx, bz, footprint / 2, footprint / 2, 0.55)) {
            continue;
          }
          glbBuildings.push({
            id,
            x: bx,
            z: bz,
            footprint,
            rotY: Math.floor(seededRandom(seed + 7) * 4) * (Math.PI / 2),
            url: BUILDING_URLS[
              Math.floor(seededRandom(seed + 8) * BUILDING_URLS.length)
            ],
          });
        } else {
          const id = `box:${ix},${iz}`;
          const ov = BACKDROP_OVERRIDES[id];
          if (ov && seededRandom(seed + 14) < 0.4) plantTree(x, z, seed);
          const w = cell * (0.62 + seededRandom(seed + 1) * 0.34);
          const d = cell * (0.62 + seededRandom(seed + 2) * 0.34);
          const bx = ov ? ov[0] : x;
          const bz = ov ? ov[1] : z;
          const h = getBoxBuildingHeight(seed, bx, bz);
          if (!clearRoadFootprint(bx, bz, w / 2, d / 2)) {
            if (seededRandom(seed + 15) < 0.5) plantTree(x, z, seed);
            continue;
          }
          if (rectIntersectsParkClearing(bx, bz, w / 2, d / 2, 0.55)) {
            continue;
          }
          buildings.push({
            id,
            x: bx,
            z: bz,
            w,
            d,
            h,
            color: getBoxBuildingColor(seed),
          });
        }
      } else {
        // Former gap cell — sprinkle some greenery so open space across the
        // whole grid gets trees, without packing every empty cell.
        if (seededRandom(seed + 9) < 0.3) plantTree(x, z, seed);
      }
    }
  }
  for (let ix = NYC_OUTER_MIN; ix <= NYC_OUTER_MAX; ix += 1) {
    for (let iz = NYC_OUTER_MIN; iz <= NYC_OUTER_MAX; iz += 1) {
      const x = (ix + 0.5) * cell;
      const z = (iz + 0.5) * cell;
      if (Math.abs(x) <= NYC_INNER_CLEAR && Math.abs(z) <= NYC_INNER_CLEAR) continue;

      const seed = 90000 + (ix + 24) * 100 + (iz + 24);
      if (seededRandom(seed) > NYC_BUILDING_DENSITY) continue;

      const w = cell * (0.54 + seededRandom(seed + 1) * 0.28);
      const d = cell * (0.54 + seededRandom(seed + 2) * 0.28);
      const bx = x;
      const bz = z;

      if (!clearRoadFootprint(bx, bz, w / 2, d / 2)) continue;
      if (rectIntersectsParkClearing(bx, bz, w / 2, d / 2, 0.55)) continue;
      if (
        bx > -officeW / 2 &&
        bx < officeW / 2 &&
        bz > -officeH / 2 &&
        bz < officeH / 2
      ) {
        continue;
      }
      if (bx > bankMinX && bx < bankMaxX && bz > bankMinZ && bz < bankMaxZ) {
        continue;
      }
      if (
        bx > SHOWROOM_X - SHOWROOM_W / 2 - 6 &&
        bx < SHOWROOM_X + SHOWROOM_W / 2 + 6 &&
        bz > SHOWROOM_Z - SHOWROOM_D / 2 - 6 &&
        bz < SHOWROOM_Z + SHOWROOM_D / 2 + 6
      ) {
        continue;
      }
      if (
        bx > SOUTH_PARKING_MIN_X - 1 &&
        bx < SOUTH_PARKING_MAX_X + 1 &&
        bz > SOUTH_PARKING_MIN_Z - 1 &&
        bz < SOUTH_PARKING_MAX_Z + 1
      ) {
        continue;
      }
      if (
        bx > SOUTH_FASTFOOD_MIN_X - 2 &&
        bx < SOUTH_FASTFOOD_MAX_X + 2 &&
        bz > SOUTH_FASTFOOD_MIN_Z - 2 &&
        bz < SOUTH_FASTFOOD_MAX_Z + 2
      ) {
        continue;
      }
      if (
        bx > SOUTH_PARKING_MIN_X + 1 &&
        bx < SOUTH_PARKING_MAX_X - 1 &&
        bz > SOUTH_PARKING_MAX_Z - 0.6 &&
        bz < SOUTH_FASTFOOD_MIN_Z + 1
      ) {
        continue;
      }

      const h = getBoxBuildingHeight(seed, bx, bz);
      buildings.push({
        id: `nyc:${ix},${iz}`,
        x: bx,
        z: bz,
        w,
        d,
        h,
        color: getBoxBuildingColor(seed),
      });
    }
  }

  return { buildings, glbBuildings, trees };
}

// Centre-line dashes for every road, baked into one InstancedMesh — a single
// draw call regardless of road length, so the carriageways can run all the way
// out to the fog without paying for hundreds of separate dash meshes.
const DASH_LEN = 2.0;
const DASH_GAP = 1.8;
const DASH_FLAT = new THREE.Euler(-Math.PI / 2, 0, 0);
const DASH_PER_ROAD = Math.floor(ROAD_LEN / (DASH_LEN + DASH_GAP));

const RoadDashes = memo(function RoadDashes(): React.JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = ROADS.length * DASH_PER_ROAD;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion().setFromEuler(DASH_FLAT);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let idx = 0;
    for (const road of ROADS) {
      for (let j = 0; j < DASH_PER_ROAD; j++) {
        const o = -ROAD_LEN / 2 + j * (DASH_LEN + DASH_GAP) + DASH_LEN / 2;
        if (road.axis === "x") {
          pos.set(o, ROAD_MARKING_Y, road.center);
          scl.set(DASH_LEN, 0.18, 1);
        } else {
          pos.set(road.center, ROAD_MARKING_Y, o);
          scl.set(0.18, DASH_LEN, 1);
        }
        matrix.compose(pos, quat, scl);
        mesh.setMatrixAt(idx++, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="#f5e642" roughness={0.9} />
    </instancedMesh>
  );
});

/** Sparse city backdrop — buildings, trees, roads and street furniture. */
export const CityBackdrop = memo(function CityBackdrop({
  world,
  devMode = false,
  moved,
  onPick,
}: {
  /**
   * Temporary optional fallback until Office3D threads the shared world state
   * through. Callers can start passing `world` immediately without changing
   * this component again.
   */
  world?: WorldSceneState;
  devMode?: boolean;
  /** Session-only position overrides keyed by building id ([x, y, z]). */
  moved?: Record<string, [number, number, number]>;
  /** Dev: called when a building is clicked while devMode is on. */
  onPick?: (b: { id: string; label: string; x: number; z: number }) => void;
} = {}): React.JSX.Element {
  const resolvedWorld = world ?? FALLBACK_WORLD;
  const { buildings, glbBuildings, trees } = useMemo(
    () => generateBackdrop(),
    [],
  );
  const visuals = useMemo(
    () => getCityBackdropWorldVisuals(resolvedWorld),
    [resolvedWorld],
  );
  const rainStrength =
    resolvedWorld.weather.kind === "rain"
      ? resolvedWorld.weather.rainStrength
      : 0;

  const roadSouthZ = ROAD_SOUTH_Z;
  const roadNorthZ = ROAD_NORTH_Z;
  const roadEastX = ROAD_EAST_X;
  const roadWidth = ROAD_WIDTH;
  const southEntranceSightlineHalfWidth = 5.5;
  const southGateCrosswalkLampClearHalfWidth = SOUTH_CROSSWALK_W / 2 + 2.4;

  // Lamp spots along the inner roads, skipping any that land on a crossing.
  const { lampZs, southRoadNorthSideLampXs, southRoadSouthSideLampXs } =
    useMemo(() => {
      const lampSpots = [-44, -33, -22, -11, 0, 11, 22, 33, 44];
      const clearOfRoads = (o: number, crossAxis: "x" | "z"): boolean =>
        ROADS.every(
          (r) =>
            r.axis !== crossAxis ||
            Math.abs(o - r.center) > roadWidth / 2 + 1.2,
        );
      const filteredLampXs = lampSpots.filter((o) => clearOfRoads(o, "z"));
      return {
        lampXs: filteredLampXs,
        lampZs: lampSpots.filter((o) => clearOfRoads(o, "x")),
        // Keep the street-light system intact, but leave the office south-door
        // sightline open by skipping the one lamp that lands directly ahead.
        southRoadNorthSideLampXs: filteredLampXs.filter(
          (o) => Math.abs(o) > southEntranceSightlineHalfWidth,
        ),
        southRoadSouthSideLampXs: filteredLampXs.filter(
          (o) =>
            Math.abs(o - SOUTH_CROSSWALK_X) >
            southGateCrosswalkLampClearHalfWidth,
        ),
      };
    }, [
      roadWidth,
      southEntranceSightlineHalfWidth,
      southGateCrosswalkLampClearHalfWidth,
    ]);

  useLayoutEffect(() => {
    roadMat.color.copy(visuals.roadColor);
    roadMat.roughness = THREE.MathUtils.lerp(0.95, 0.26, visuals.roadGloss);
    roadMat.metalness = THREE.MathUtils.lerp(0, 0.24, visuals.roadGloss);
    roadMat.envMapIntensity = THREE.MathUtils.lerp(
      0.85,
      1.25,
      visuals.roadGloss,
    );
  }, [visuals]);

  return (
    <group>
      {/* Ground disc out to the horizon. Fog fades it into the sky long
          before the rim is visible. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <circleGeometry args={[380, 64]} />
        <meshStandardMaterial
          color={visuals.groundColor}
          roughness={visuals.groundRoughness}
          metalness={visuals.groundMetalness}
        />
      </mesh>
      {/* Road surfaces — shared unit plane scaled per road */}
      {ROADS.map((road, i) => (
        <mesh
          key={`road-${i}`}
          geometry={unitPlaneGeo}
          material={roadMat}
          dispose={null}
          rotation={[-Math.PI / 2, 0, 0]}
          position={
            road.axis === "x"
              ? [0, ROAD_Y, road.center]
              : [road.center, ROAD_Y, 0]
          }
          scale={
            road.axis === "x"
              ? [ROAD_LEN, roadWidth, 1]
              : [roadWidth, ROAD_LEN, 1]
          }
        />
      ))}
      {/* Centre dashes — one instanced draw call for all roads */}
      <CityRainRipples strength={rainStrength} />
      <RoadDashes />
      <StreetPedestrians world={resolvedWorld} rainStrength={rainStrength} />
      <UrbanLakePark />
      <SouthGateParkingLot visuals={visuals} />
      {[-1.95, -1.2, -0.45, 0.3, 1.05, 1.8].map((oz) => (
        <mesh
          key={`south-crosswalk-${oz}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            SOUTH_CROSSWALK_X,
            ROAD_MARKING_Y + 0.006,
            roadSouthZ + oz,
          ]}
          receiveShadow
        >
          <planeGeometry args={[SOUTH_CROSSWALK_W, 0.42]} />
          <meshStandardMaterial
            color={visuals.parkingPaintColor}
            roughness={THREE.MathUtils.lerp(
              0.72,
              0.28,
              visuals.parkingGloss * 0.7,
            )}
            metalness={THREE.MathUtils.lerp(
              0.02,
              0.12,
              visuals.parkingGloss * 0.35,
            )}
          />
        </mesh>
      ))}
      {[-1, 1].map((dir) => (
        <mesh
          key={`south-stop-line-${dir}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            dir * SOUTH_CROSSWALK_STOP_LINE_OFFSET,
            ROAD_MARKING_Y + 0.005,
            roadSouthZ + (dir > 0 ? roadWidth / 4 : -roadWidth / 4),
          ]}
          receiveShadow
        >
          <planeGeometry args={[0.24, roadWidth / 2 - 0.42]} />
          <meshStandardMaterial
            color={visuals.parkingPaintColor}
            roughness={THREE.MathUtils.lerp(
              0.72,
              0.28,
              visuals.parkingGloss * 0.7,
            )}
            metalness={THREE.MathUtils.lerp(
              0.02,
              0.12,
              visuals.parkingGloss * 0.35,
            )}
          />
        </mesh>
      ))}
      {/* Far buildings — flat windowless boxes (1 draw call each); fog hides
          the missing detail. Near buildings use detailed GLBs below. */}
      {buildings.map((b, i) => {
        const mv = moved?.[b.id];
        const bx = mv ? mv[0] : b.x;
        const bz = mv ? mv[2] : b.z;
        return (
          <mesh
            key={`b-${i}`}
            position={[bx, b.h / 2, bz]}
            castShadow
            receiveShadow
            onClick={
              devMode && onPick
                ? (e) => {
                    e.stopPropagation();
                    onPick({ id: b.id, label: "Building", x: bx, z: bz });
                  }
                : undefined
            }
          >
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial
              color={b.color}
              roughness={THREE.MathUtils.lerp(0.88, 0.56, visuals.facadeSheen)}
              metalness={THREE.MathUtils.lerp(
                0.04,
                0.12,
                visuals.facadeSheen * 0.7,
              )}
            />
          </mesh>
        );
      })}
      <BoxBuildingWindowLights
        buildings={buildings}
        moved={moved}
        glowColor={visuals.windowGlowColor}
        opacity={THREE.MathUtils.clamp(visuals.buildingGlow * 0.38, 0, 0.46)}
      />
      <Suspense fallback={null}>
        {glbBuildings.map((g, i) => {
          const mv = moved?.[g.id];
          const gx = mv ? mv[0] : g.x;
          const gz = mv ? mv[2] : g.z;
          return (
            <CityBuildingGlb
              key={`gb-${i}`}
              x={gx}
              z={gz}
              footprint={g.footprint}
              rotY={g.rotY}
              url={g.url}
              buildingGlow={visuals.buildingGlow}
              facadeSheen={visuals.facadeSheen}
              windowGlowColor={visuals.windowGlowColor}
              interiorBoost={visuals.interiorBoost}
              onClick={
                devMode && onPick
                  ? (e) => {
                      e.stopPropagation();
                      onPick({ id: g.id, label: "Building", x: gx, z: gz });
                    }
                  : undefined
              }
            />
          );
        })}
        {trees.map((t, i) => (
          <TreeGlb key={`t-${i}`} x={t.x} z={t.z} h={t.h} />
        ))}
        {/* Traffic lights at two key inner-road approaches */}
        <TrafficLightGlb
          x={roadEastX - roadWidth / 2 - 0.6}
          z={roadSouthZ - roadWidth / 2 - 0.6}
          rotY={Math.PI}
        />
        <TrafficLightGlb
          x={-roadEastX + roadWidth / 2 + 0.6}
          z={roadSouthZ - roadWidth / 2 - 0.6}
          rotY={0}
        />
        <TrafficLightGlb
          x={roadEastX - roadWidth / 2 - 0.6}
          z={roadNorthZ + roadWidth / 2 + 0.6}
          rotY={Math.PI}
        />
        {/* Street lights along E-W south road — both sides */}
        {southRoadNorthSideLampXs.map((ox) => (
          <StreetLightGlb
            key={`sl-ews-n-${ox}`}
            x={ox}
            z={roadSouthZ - roadWidth / 2 - 1.0}
            rotY={0}
            lampOn={visuals.streetLightOn}
            glowStrength={visuals.streetLightGlow}
            glowColor={visuals.windowGlowColor}
          />
        ))}
        {southRoadSouthSideLampXs.map((ox) => (
          <StreetLightGlb
            key={`sl-ews-s-${ox}`}
            x={ox}
            z={roadSouthZ + roadWidth / 2 + 1.0}
            rotY={Math.PI}
            lampOn={visuals.streetLightOn}
            glowStrength={visuals.streetLightGlow}
            glowColor={visuals.windowGlowColor}
          />
        ))}
        {/* Street lights along N-S east road */}
        {lampZs.map((oz) => (
          <StreetLightGlb
            key={`sl-nse-w-${oz}`}
            x={roadEastX - roadWidth / 2 - 1.0}
            z={oz}
            rotY={Math.PI / 2}
            lampOn={visuals.streetLightOn}
            glowStrength={visuals.streetLightGlow}
            glowColor={visuals.windowGlowColor}
          />
        ))}
        {/* Street lights along N-S west road */}
        {lampZs.map((oz) => (
          <StreetLightGlb
            key={`sl-nsw-e-${oz}`}
            x={-roadEastX + roadWidth / 2 + 1.0}
            z={oz}
            rotY={-Math.PI / 2}
            lampOn={visuals.streetLightOn}
            glowStrength={visuals.streetLightGlow}
            glowColor={visuals.windowGlowColor}
          />
        ))}
      </Suspense>
    </group>
  );
});

useGLTF.preload(treeGlbUrl, false, false);
useGLTF.preload(building1GlbUrl, false, false);
useGLTF.preload(building2GlbUrl, false, false);
useGLTF.preload(apartmentGlbUrl, false, false);
useGLTF.preload(apartment2GlbUrl, false, false);
useGLTF.preload(streetLightGlbUrl, false, false);
useGLTF.preload(trafficLightGlbUrl, false, false);
