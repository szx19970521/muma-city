import { WORLD_H, WORLD_W } from "./constants";
import {
  BANK_D,
  BANK_STREET_GAP,
  BANK_W,
  BANK_X,
  BANK_Z,
  ROAD_SOUTH_Z,
  ROAD_WIDTH,
  ROADS,
  SHOWROOM_D,
  SHOWROOM_W,
  SHOWROOM_X,
  SHOWROOM_Z,
  VIEW_BLOCKER_SPOTS,
  rectIntersectsParkClearing,
} from "./cityPlan";
import { seededRandom } from "./rng";
import { BACKDROP_OVERRIDES } from "./backdropOverrides";

export interface BackdropBuildingFootprint {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

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
const NYC_OUTER_MIN = -26;
const NYC_OUTER_MAX = 25;
const NYC_INNER_CLEAR = 52.5;
const NYC_BUILDING_DENSITY = 0.52;

function roadFootprintIsClear(
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
): boolean {
  return ROADS.every((road) =>
    road.axis === "x"
      ? Math.abs(cz - road.center) >= ROAD_WIDTH / 2 + halfZ
      : Math.abs(cx - road.center) >= ROAD_WIDTH / 2 + halfX,
  );
}

export function getBackdropBuildingFootprints(): BackdropBuildingFootprint[] {
  const footprints: BackdropBuildingFootprint[] = [];
  const cell = 5.0;
  const rows = 20;
  const cols = 20;
  const treeRoll = 0.08;
  const buildingRoll = 0.82;
  const detailedBuildingRadius = 62;
  const margin = 2.5;
  const officeW = WORLD_W + margin;
  const officeH = WORLD_H + margin;
  const bankMinZ = BANK_Z - BANK_D / 2 - margin;
  const bankMaxZ = BANK_Z + BANK_D / 2 + margin;
  const bankMinX = BANK_X - BANK_W / 2 - margin;
  const bankMaxX = BANK_X + BANK_W / 2 + margin;
  const roadClearance = ROAD_WIDTH / 2 + 1.5;

  for (let ix = 0; ix < cols; ix += 1) {
    for (let iz = 0; iz < rows; iz += 1) {
      const x = (ix - cols / 2 + 0.5) * cell;
      const z = (iz - rows / 2 + 0.5) * cell;

      if (x > -officeW / 2 && x < officeW / 2 && z > -officeH / 2 && z < officeH / 2) {
        continue;
      }
      if (x > bankMinX && x < bankMaxX && z > bankMinZ && z < bankMaxZ) {
        continue;
      }

      const showroomClear = 6;
      if (
        x > SHOWROOM_X - SHOWROOM_W / 2 - showroomClear &&
        x < SHOWROOM_X + SHOWROOM_W / 2 + showroomClear &&
        z > SHOWROOM_Z - SHOWROOM_D / 2 - showroomClear &&
        z < SHOWROOM_Z + SHOWROOM_D / 2 + showroomClear
      ) {
        continue;
      }

      if (
        x > SOUTH_PARKING_MIN_X - 1 &&
        x < SOUTH_PARKING_MAX_X + 1 &&
        z > SOUTH_PARKING_MIN_Z - 1 &&
        z < SOUTH_PARKING_MAX_Z + 1
      ) {
        continue;
      }
      if (
        x > SOUTH_FASTFOOD_MIN_X - 2 &&
        x < SOUTH_FASTFOOD_MAX_X + 2 &&
        z > SOUTH_FASTFOOD_MIN_Z - 2 &&
        z < SOUTH_FASTFOOD_MAX_Z + 2
      ) {
        continue;
      }
      if (
        x > SOUTH_PARKING_MIN_X + 1 &&
        x < SOUTH_PARKING_MAX_X - 1 &&
        z > SOUTH_PARKING_MAX_Z - 0.6 &&
        z < SOUTH_FASTFOOD_MIN_Z + 1
      ) {
        continue;
      }
      if (
        VIEW_BLOCKER_SPOTS.some(
          ([bx, bz]) => Math.abs(x - bx) < cell / 2 && Math.abs(z - bz) < cell / 2,
        )
      ) {
        continue;
      }

      const roadBlocked = ROADS.some((road) =>
        road.axis === "x"
          ? Math.abs(z - road.center) < roadClearance
          : Math.abs(x - road.center) < roadClearance,
      );
      if (roadBlocked) continue;

      const connectorZ = -(WORLD_H / 2 + BANK_STREET_GAP / 2);
      if (
        z > connectorZ - BANK_STREET_GAP / 2 - 1 &&
        z < connectorZ + BANK_STREET_GAP / 2 + 1 &&
        x > -BANK_W / 2 - 1 &&
        x < BANK_W / 2 + 1
      ) {
        continue;
      }

      const seed = ix * 100 + iz;
      const roll = seededRandom(seed);
      if (roll < treeRoll || roll >= buildingRoll) continue;

      if (Math.hypot(x, z) < detailedBuildingRadius) {
        const id = `gb:${ix},${iz}`;
        const override = BACKDROP_OVERRIDES[id];
        const footprint = cell * (0.95 + seededRandom(seed + 6) * 0.45);
        const bx = override ? override[0] : x;
        const bz = override ? override[1] : z;
        if (!roadFootprintIsClear(bx, bz, footprint / 2, footprint / 2)) continue;
        if (rectIntersectsParkClearing(bx, bz, footprint / 2, footprint / 2, 0.55)) {
          continue;
        }
        footprints.push({ id, x: bx, z: bz, w: footprint, d: footprint });
      } else {
        const id = `box:${ix},${iz}`;
        const override = BACKDROP_OVERRIDES[id];
        const w = cell * (0.62 + seededRandom(seed + 1) * 0.34);
        const d = cell * (0.62 + seededRandom(seed + 2) * 0.34);
        const bx = override ? override[0] : x;
        const bz = override ? override[1] : z;
        if (!roadFootprintIsClear(bx, bz, w / 2, d / 2)) continue;
        if (rectIntersectsParkClearing(bx, bz, w / 2, d / 2, 0.55)) {
          continue;
        }
        footprints.push({ id, x: bx, z: bz, w, d });
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

      if (!roadFootprintIsClear(bx, bz, w / 2, d / 2)) continue;
      if (rectIntersectsParkClearing(bx, bz, w / 2, d / 2, 0.55)) continue;
      if (bx > -officeW / 2 && bx < officeW / 2 && bz > -officeH / 2 && bz < officeH / 2) {
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

      footprints.push({ id: `nyc:${ix},${iz}`, x: bx, z: bz, w, d });
    }
  }

  return footprints;
}
