import * as THREE from "three";
import { AGENT_RADIUS, CANVAS_H, CANVAS_W, SCALE } from "./constants";
import {
  BANK_D,
  BANK_W,
  BANK_X,
  BANK_Z,
  ROADS,
  ROAD_SOUTH_Z,
  ROAD_WIDTH,
  SHOWROOM_D,
  SHOWROOM_W,
  SHOWROOM_WALL_T,
  SHOWROOM_X,
  SHOWROOM_Z,
  isInsideParkLake,
} from "./cityPlan";
import { getBackdropBuildingFootprints } from "./backdropBuildingFootprints";
import {
  GLASS_DOOR_PANELS,
  GLASS_WALLS,
  INTERIOR_WALLS,
  LOUNGE_NAV_OBSTACLES,
  CEO_DESK_X,
  CEO_DESK_Y,
  CEO_TEA_TABLE_X,
  CEO_TEA_TABLE_Y,
  EMPLOYEE_SEAT_BACK,
  type WallSegment,
} from "../layout";

export interface CanvasPoint {
  x: number;
  y: number;
}

interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WorldRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface DoorSensorPoint {
  x: number;
  z: number;
}

const AGENT_NAV_CELL = 40;
const AGENT_WALK_MARGIN = 32;

const FIRST_PERSON_RADIUS = 0.42;
const HALF_WORLD_W = (CANVAS_W * SCALE) / 2;
const HALF_WORLD_H = (CANVAS_H * SCALE) / 2;
const SOUTH_ENTRY_GAP_HALF_W = 2.3;
const SOUTH_ENTRY_DOOR_PANEL_GAP = 0.08;
const SOUTH_ENTRY_DOOR_SLIDE = 0.92;
const SOUTH_ENTRY_SENSOR_HALF_W = 3.7;
const SOUTH_ENTRY_SENSOR_DEPTH = 4.1;
const SOUTH_ENTRY_PANEL_T = 0.18;
const SOUTH_ENTRY_PANEL_W = SOUTH_ENTRY_GAP_HALF_W - SOUTH_ENTRY_DOOR_PANEL_GAP;
const SOUTH_ENTRY_PANEL_BASE_X = SOUTH_ENTRY_GAP_HALF_W / 2;
const INDOOR_DOOR_SENSOR_R = 2.75;
const INDOOR_DOOR_PANEL_T = 0.14;
const PERIMETER_WALL_T = 0.34;
const SOUTH_PARKING_W = 30.8;
const SOUTH_PARKING_GAP_FROM_ROAD = 2.2;
const SOUTH_PARKING_D = 11.4;
const SOUTH_FASTFOOD_W = 24.4;
const SOUTH_FASTFOOD_D = 13.8;
const SOUTH_FASTFOOD_OFFSET_FROM_PARKING = 22.5;
const SOUTH_FASTFOOD_DOOR_X = 0;
const SOUTH_FASTFOOD_DOOR_W = 2.7;
const SOUTH_FASTFOOD_DOOR_SENSOR_R = 3.35;
const SOUTH_FASTFOOD_WALL_T = 0.28;
const SHOWROOM_DOOR_W = 3.2;
const SHOWROOM_DOOR_SENSOR_R = 4.2;
const SOUTH_PARKING_CENTRE_Z =
  ROAD_SOUTH_Z + ROAD_WIDTH / 2 + SOUTH_PARKING_GAP_FROM_ROAD + SOUTH_PARKING_D / 2;
const SOUTH_PARKING_MAX_X = SOUTH_PARKING_W / 2;
const SOUTH_PARKING_MIN_Z = SOUTH_PARKING_CENTRE_Z - SOUTH_PARKING_D / 2;
const SOUTH_PARKING_MAX_Z =
  ROAD_SOUTH_Z + ROAD_WIDTH / 2 + SOUTH_PARKING_GAP_FROM_ROAD + SOUTH_PARKING_D;
const SOUTH_FASTFOOD_CENTRE_Z =
  SOUTH_PARKING_MAX_Z + SOUTH_FASTFOOD_OFFSET_FROM_PARKING;
const SOUTH_FASTFOOD_FRONT_Z = SOUTH_FASTFOOD_CENTRE_Z - SOUTH_FASTFOOD_D / 2;
const SOUTH_FASTFOOD_BACK_Z = SOUTH_FASTFOOD_CENTRE_Z + SOUTH_FASTFOOD_D / 2;
const OUTDOOR_TRAVEL_MARGIN = ROAD_WIDTH / 2 + 4.8;
const OUTDOOR_MIN_X =
  -Math.max(...ROADS.filter((road) => road.axis === "z").map((road) => Math.abs(road.center))) -
  OUTDOOR_TRAVEL_MARGIN;
const OUTDOOR_MAX_X = -OUTDOOR_MIN_X;
const OUTDOOR_MIN_Z =
  Math.min(...ROADS.filter((road) => road.axis === "x").map((road) => road.center)) -
  OUTDOOR_TRAVEL_MARGIN;
const OUTDOOR_MAX_Z =
  Math.max(
    SOUTH_FASTFOOD_BACK_Z,
    ...ROADS.filter((road) => road.axis === "x").map((road) => road.center),
  ) + OUTDOOR_TRAVEL_MARGIN;
const FIRST_PERSON_BOUNDS = {
  minX: OUTDOOR_MIN_X,
  maxX: OUTDOOR_MAX_X,
  minZ: OUTDOOR_MIN_Z,
  maxZ: OUTDOOR_MAX_Z,
};

const STATIC_WALLS = [...INTERIOR_WALLS, ...GLASS_WALLS];

const EMPLOYEE_DESK_OBSTACLES: CanvasRect[] = Array.from({ length: 12 }, (_, index) => {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 95 + col * 245 - 10,
    y: 220 + row * 235 - 10,
    w: 170,
    h: 96,
  };
});

const EMPLOYEE_CHAIR_FIRST_PERSON_OBSTACLES: CanvasRect[] = Array.from(
  { length: 12 },
  (_, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const deskX = 95 + col * 245;
    const deskY = 220 + row * 235;
    const seatX = deskX + 75;
    const seatY = deskY - EMPLOYEE_SEAT_BACK;
    return {
      x: seatX - 34,
      y: seatY - 34,
      w: 68,
      h: 68,
    };
  },
);

const EXECUTIVE_OFFICE_CANVAS_OBSTACLES: CanvasRect[] = [
  // Executive desk body. Kept slightly south of the chair so the manager seat
  // remains reachable while the desk itself feels solid.
  { x: CEO_DESK_X - 112, y: CEO_DESK_Y - 42, w: 224, h: 94 },
  // Tea table / reception table.
  { x: CEO_TEA_TABLE_X - 60, y: CEO_TEA_TABLE_Y - 38, w: 120, h: 76 },
  // Reception sofa and flanking guest chairs.
  { x: 160, y: 1588, w: 150, h: 72 },
  { x: 92, y: 1468, w: 78, h: 78 },
  { x: 311, y: 1476, w: 78, h: 78 },
  // Door-side planters.
  { x: 482, y: 1362, w: 36, h: 36 },
  { x: 482, y: 1632, w: 36, h: 36 },
];

function worldRect(cx: number, z: number, w: number, d: number, pad = 0): WorldRect {
  return {
    minX: cx - w / 2 - pad,
    maxX: cx + w / 2 + pad,
    minZ: z - d / 2 - pad,
    maxZ: z + d / 2 + pad,
  };
}

function parkingCanopyPostRects(cx: number, z: number, w: number, d: number): WorldRect[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) =>
      worldRect(
        cx + sx * (w / 2 - 0.36),
        z + sz * (d / 2 - 0.36),
        0.22,
        0.22,
        0.04,
      ),
    ),
  );
}

const SOUTH_PARKING_NORTH_ROW_Z = SOUTH_PARKING_MIN_Z + 2.35;
const SOUTH_PARKING_SOUTH_ROW_Z = SOUTH_PARKING_MAX_Z - 2.35;
const SOUTH_PARKING_REAR_STREET_Z = SOUTH_PARKING_MAX_Z + 1.7;

const PARKING_LOT_WORLD_OBSTACLES: WorldRect[] = [
  ...[
    [-12.2, SOUTH_PARKING_NORTH_ROW_Z + 1.82],
    [8.4, SOUTH_PARKING_NORTH_ROW_Z + 1.82],
    [8.4, SOUTH_PARKING_SOUTH_ROW_Z - 1.82],
  ].map(([x, z]) => worldRect(x, z, 1.75, 2.8, 0.08)),
  ...[
    [-12.2, SOUTH_PARKING_NORTH_ROW_Z + 3.12],
    [-8.4, SOUTH_PARKING_NORTH_ROW_Z + 3.12],
    [8.4, SOUTH_PARKING_NORTH_ROW_Z + 3.12],
    [8.4, SOUTH_PARKING_SOUTH_ROW_Z - 3.12],
  ].map(([x, z]) => worldRect(x, z, 0.78, 0.78, 0.05)),
  ...parkingCanopyPostRects(-10.3, SOUTH_PARKING_NORTH_ROW_Z + 1.42, 7.6, 5.8),
  ...parkingCanopyPostRects(8.4, SOUTH_PARKING_SOUTH_ROW_Z - 1.42, 7.6, 5.8),
  worldRect(SOUTH_PARKING_MAX_X + 2.2, SOUTH_PARKING_CENTRE_Z - 0.4, 0.78, 0.78, 0.08),
  ...[-11.5, -4.2, 4.2, 11.5].map((x) =>
    worldRect(x, SOUTH_PARKING_REAR_STREET_Z, 0.42, 0.42, 0.04),
  ),
  ...[-7.4, 7.4].map((x) =>
    worldRect(x, SOUTH_PARKING_REAR_STREET_Z + 0.92, 2.3, 0.72, 0.08),
  ),
  ...[-12.4, 0, 12.4].map((x) =>
    worldRect(x, SOUTH_PARKING_REAR_STREET_Z + 1.78, 3.25, 1.05, 0.08),
  ),
];

const FAST_FOOD_WORLD_OBSTACLES: WorldRect[] = [
  worldRect(0, SOUTH_FASTFOOD_BACK_Z - SOUTH_FASTFOOD_WALL_T / 2, SOUTH_FASTFOOD_W, SOUTH_FASTFOOD_WALL_T),
  worldRect(-SOUTH_FASTFOOD_W / 2 + SOUTH_FASTFOOD_WALL_T / 2, SOUTH_FASTFOOD_CENTRE_Z, SOUTH_FASTFOOD_WALL_T, SOUTH_FASTFOOD_D),
  worldRect(SOUTH_FASTFOOD_W / 2 - SOUTH_FASTFOOD_WALL_T / 2, SOUTH_FASTFOOD_CENTRE_Z, SOUTH_FASTFOOD_WALL_T, SOUTH_FASTFOOD_D),
  {
    minX: -SOUTH_FASTFOOD_W / 2,
    maxX: SOUTH_FASTFOOD_DOOR_X - SOUTH_FASTFOOD_DOOR_W / 2,
    minZ: SOUTH_FASTFOOD_FRONT_Z - SOUTH_FASTFOOD_WALL_T / 2,
    maxZ: SOUTH_FASTFOOD_FRONT_Z + SOUTH_FASTFOOD_WALL_T / 2,
  },
  {
    minX: SOUTH_FASTFOOD_DOOR_X + SOUTH_FASTFOOD_DOOR_W / 2,
    maxX: SOUTH_FASTFOOD_W / 2,
    minZ: SOUTH_FASTFOOD_FRONT_Z - SOUTH_FASTFOOD_WALL_T / 2,
    maxZ: SOUTH_FASTFOOD_FRONT_Z + SOUTH_FASTFOOD_WALL_T / 2,
  },
  worldRect(0, SOUTH_FASTFOOD_BACK_Z - 2.05, 11.2, 1.1, 0.08),
  worldRect(-7.4, SOUTH_FASTFOOD_CENTRE_Z + 1.2, 2.2, 1.55, 0.06),
  worldRect(7.4, SOUTH_FASTFOOD_CENTRE_Z + 1.2, 2.2, 1.55, 0.06),
  ...[
    [-4.8, SOUTH_FASTFOOD_CENTRE_Z - 2.3],
    [0, SOUTH_FASTFOOD_CENTRE_Z - 2.65],
    [4.8, SOUTH_FASTFOOD_CENTRE_Z - 2.3],
  ].map(([x, z]) => worldRect(x, z, 1.55, 1.9, 0.06)),
];

const BANK_WORLD_OBSTACLES: WorldRect[] = [
  worldRect(BANK_X, BANK_Z, BANK_W, BANK_D, 0.04),
];

const SHOWROOM_FRONT_X = SHOWROOM_X + SHOWROOM_W / 2;
const SHOWROOM_WEST_X = SHOWROOM_X - SHOWROOM_W / 2;
const SHOWROOM_NORTH_Z = SHOWROOM_Z - SHOWROOM_D / 2;
const SHOWROOM_SOUTH_Z = SHOWROOM_Z + SHOWROOM_D / 2;
const SHOWROOM_DOOR_HALF_W = SHOWROOM_DOOR_W / 2;

const SHOWROOM_WORLD_OBSTACLES: WorldRect[] = [
  worldRect(SHOWROOM_WEST_X, SHOWROOM_Z, SHOWROOM_WALL_T, SHOWROOM_D, 0.03),
  worldRect(SHOWROOM_X, SHOWROOM_NORTH_Z, SHOWROOM_W, SHOWROOM_WALL_T, 0.03),
  worldRect(SHOWROOM_X, SHOWROOM_SOUTH_Z, SHOWROOM_W, SHOWROOM_WALL_T, 0.03),
  worldRect(
    SHOWROOM_FRONT_X,
    (SHOWROOM_NORTH_Z + (SHOWROOM_Z - SHOWROOM_DOOR_HALF_W)) / 2,
    SHOWROOM_WALL_T,
    SHOWROOM_D / 2 - SHOWROOM_DOOR_HALF_W,
    0.03,
  ),
  worldRect(
    SHOWROOM_FRONT_X,
    ((SHOWROOM_Z + SHOWROOM_DOOR_HALF_W) + SHOWROOM_SOUTH_Z) / 2,
    SHOWROOM_WALL_T,
    SHOWROOM_D / 2 - SHOWROOM_DOOR_HALF_W,
    0.03,
  ),
];

const SHOWROOM_DISPLAY_CAR_WORLD_OBSTACLES: WorldRect[] = [
  worldRect(SHOWROOM_X + 1.5, SHOWROOM_Z, 2.25, 2.25, 0.06),
  ...[
    [-4, -7],
    [-4, -2.5],
    [-4, 2.5],
    [-4, 7],
    [2.5, -6.5],
    [2.5, 6.5],
  ].map(([x, z]) => worldRect(SHOWROOM_X + x, SHOWROOM_Z + z, 2.05, 2.05, 0.06)),
];

const SHOWROOM_PLANT_WORLD_OBSTACLES: WorldRect[] = [-3.2, 3.2].map((z) =>
  worldRect(SHOWROOM_FRONT_X + 0.8, SHOWROOM_Z + z, 0.68, 0.68, 0.04),
);

const BACKDROP_BUILDING_WORLD_OBSTACLES: WorldRect[] = getBackdropBuildingFootprints().map(
  (building) => worldRect(building.x, building.z, building.w, building.d, 0.03),
);

const STATIC_CANVAS_OBSTACLES: CanvasRect[] = [
  ...EMPLOYEE_DESK_OBSTACLES,
  ...EXECUTIVE_OFFICE_CANVAS_OBSTACLES,
  // Memory library / bookshelf.
  { x: 1232, y: 154, w: 248, h: 82 },
  // Brain engine console.
  { x: 1502, y: 246, w: 245, h: 210 },
  // Gym equipment.
  { x: 1060, y: 92, w: 108, h: 72 },
  { x: 926, y: 154, w: 154, h: 78 },
  { x: 785, y: 86, w: 132, h: 58 },
  { x: 1060, y: 210, w: 86, h: 92 },
  // Tool room cabinet.
  { x: 1390, y: 1728, w: 250, h: 62 },
  // Communications center.
  { x: 30, y: 1165, w: 175, h: 175 },
];

const FIRST_PERSON_WORLD_OBSTACLES: WorldRect[] = [
  // Building perimeter walls. The office used to rely on the global first-
  // person bounds as an invisible room box; now that the player can step out
  // to the street, we model the shell explicitly and leave a centered south
  // doorway gap for the lobby exit.
  {
    minX: -HALF_WORLD_W - PERIMETER_WALL_T / 2,
    maxX: -HALF_WORLD_W + PERIMETER_WALL_T / 2,
    minZ: -HALF_WORLD_H,
    maxZ: HALF_WORLD_H,
  },
  {
    minX: HALF_WORLD_W - PERIMETER_WALL_T / 2,
    maxX: HALF_WORLD_W + PERIMETER_WALL_T / 2,
    minZ: -HALF_WORLD_H,
    maxZ: HALF_WORLD_H,
  },
  {
    minX: -HALF_WORLD_W,
    maxX: HALF_WORLD_W,
    minZ: -HALF_WORLD_H - PERIMETER_WALL_T / 2,
    maxZ: -HALF_WORLD_H + PERIMETER_WALL_T / 2,
  },
  {
    minX: -HALF_WORLD_W,
    maxX: -SOUTH_ENTRY_GAP_HALF_W,
    minZ: HALF_WORLD_H - PERIMETER_WALL_T / 2,
    maxZ: HALF_WORLD_H + PERIMETER_WALL_T / 2,
  },
  {
    minX: SOUTH_ENTRY_GAP_HALF_W,
    maxX: HALF_WORLD_W,
    minZ: HALF_WORLD_H - PERIMETER_WALL_T / 2,
    maxZ: HALF_WORLD_H + PERIMETER_WALL_T / 2,
  },
  // Memory library / bookshelf.
  { minX: 6.78, maxX: 11.64, minZ: -13.22, maxZ: -12.02 },
  // Brain engine console.
  { minX: 10.9, maxX: 15.25, minZ: -11.7, maxZ: -8.35 },
  // Communications center.
  { minX: -15.55, maxX: -12.75, minZ: 4.95, maxZ: 7.75 },
  // Executive chair is first-person only so the manager seat remains agent-reachable.
  { minX: -11.42, maxX: -10.18, minZ: 4.7, maxZ: 6.05 },
  ...PARKING_LOT_WORLD_OBSTACLES,
  ...FAST_FOOD_WORLD_OBSTACLES,
  ...BANK_WORLD_OBSTACLES,
  ...SHOWROOM_WORLD_OBSTACLES,
  ...SHOWROOM_DISPLAY_CAR_WORLD_OBSTACLES,
  ...SHOWROOM_PLANT_WORLD_OBSTACLES,
  ...BACKDROP_BUILDING_WORLD_OBSTACLES,
];

function clampCanvasPoint(point: CanvasPoint): CanvasPoint {
  return {
    x: THREE.MathUtils.clamp(point.x, AGENT_WALK_MARGIN, CANVAS_W - AGENT_WALK_MARGIN),
    y: THREE.MathUtils.clamp(point.y, AGENT_WALK_MARGIN, CANVAS_H - AGENT_WALK_MARGIN),
  };
}

function canvasRectFromWall(wall: WallSegment): CanvasRect {
  return { x: wall.x, y: wall.y, w: wall.w, h: wall.h };
}

function circleIntersectsCanvasRect(
  point: CanvasPoint,
  radius: number,
  rect: CanvasRect,
): boolean {
  const nearestX = THREE.MathUtils.clamp(point.x, rect.x, rect.x + rect.w);
  const nearestY = THREE.MathUtils.clamp(point.y, rect.y, rect.y + rect.h);
  return Math.hypot(point.x - nearestX, point.y - nearestY) < radius;
}

function circleIntersectsWorldRect(
  x: number,
  z: number,
  radius: number,
  rect: WorldRect,
): boolean {
  const nearestX = THREE.MathUtils.clamp(x, rect.minX, rect.maxX);
  const nearestZ = THREE.MathUtils.clamp(z, rect.minZ, rect.maxZ);
  return Math.hypot(x - nearestX, z - nearestZ) < radius;
}

function southEntryDoorOpenness(sensor: DoorSensorPoint): number {
  const xFactor = Math.abs(sensor.x) / SOUTH_ENTRY_SENSOR_HALF_W;
  const zFactor = Math.abs(sensor.z - HALF_WORLD_H) / SOUTH_ENTRY_SENSOR_DEPTH;
  const proximity = Math.max(xFactor, zFactor);
  return 1 - THREE.MathUtils.smoothstep(proximity, 0.42, 1);
}

function southEntryDoorPanelRects(sensor: DoorSensorPoint): WorldRect[] {
  const openness = southEntryDoorOpenness(sensor);
  const slide = openness * SOUTH_ENTRY_DOOR_SLIDE;
  const minZ = HALF_WORLD_H - SOUTH_ENTRY_PANEL_T / 2;
  const maxZ = HALF_WORLD_H + SOUTH_ENTRY_PANEL_T / 2;
  const leftCenterX = -SOUTH_ENTRY_PANEL_BASE_X - slide;
  const rightCenterX = SOUTH_ENTRY_PANEL_BASE_X + slide;

  return [
    {
      minX: leftCenterX - SOUTH_ENTRY_PANEL_W / 2,
      maxX: leftCenterX + SOUTH_ENTRY_PANEL_W / 2,
      minZ,
      maxZ,
    },
    {
      minX: rightCenterX - SOUTH_ENTRY_PANEL_W / 2,
      maxX: rightCenterX + SOUTH_ENTRY_PANEL_W / 2,
      minZ,
      maxZ,
    },
  ];
}

function indoorDoorPanelRects(sensor: DoorSensorPoint): WorldRect[] {
  return GLASS_DOOR_PANELS.flatMap((door) => {
    const cx = (door.x + door.w / 2) * SCALE - (CANVAS_W * SCALE) / 2;
    const cz = (door.y + door.h / 2) * SCALE - (CANVAS_H * SCALE) / 2;
    if (Math.hypot(sensor.x - cx, sensor.z - cz) < INDOOR_DOOR_SENSOR_R) return [];
    const w = Math.max(door.w * SCALE, INDOOR_DOOR_PANEL_T);
    const d = Math.max(door.h * SCALE, INDOOR_DOOR_PANEL_T);
    return [worldRect(cx, cz, w, d)];
  });
}

function fastFoodDoorPanelRects(sensor: DoorSensorPoint): WorldRect[] {
  const doorWorldZ = SOUTH_FASTFOOD_FRONT_Z - 0.12;
  if (
    Math.hypot(sensor.x - SOUTH_FASTFOOD_DOOR_X, sensor.z - doorWorldZ) <
    SOUTH_FASTFOOD_DOOR_SENSOR_R
  ) {
    return [];
  }
  return [
    worldRect(
      SOUTH_FASTFOOD_DOOR_X,
      doorWorldZ,
      SOUTH_FASTFOOD_DOOR_W,
      SOUTH_FASTFOOD_WALL_T,
      0.02,
    ),
  ];
}

function showroomDoorPanelRects(sensor: DoorSensorPoint): WorldRect[] {
  if (
    Math.hypot(sensor.x - SHOWROOM_FRONT_X, sensor.z - SHOWROOM_Z) <
    SHOWROOM_DOOR_SENSOR_R
  ) {
    return [];
  }
  return [
    worldRect(
      SHOWROOM_FRONT_X,
      SHOWROOM_Z,
      SHOWROOM_WALL_T,
      SHOWROOM_DOOR_W,
      0.02,
    ),
  ];
}

function worldRectFromWall(wall: WallSegment): WorldRect {
  const minX = wall.x * SCALE - (CANVAS_W * SCALE) / 2;
  const maxX = (wall.x + wall.w) * SCALE - (CANVAS_W * SCALE) / 2;
  const minZ = wall.y * SCALE - (CANVAS_H * SCALE) / 2;
  const maxZ = (wall.y + wall.h) * SCALE - (CANVAS_H * SCALE) / 2;
  return { minX, maxX, minZ, maxZ };
}

function worldRectFromCanvasRect(rect: CanvasRect): WorldRect {
  return {
    minX: rect.x * SCALE - (CANVAS_W * SCALE) / 2,
    maxX: (rect.x + rect.w) * SCALE - (CANVAS_W * SCALE) / 2,
    minZ: rect.y * SCALE - (CANVAS_H * SCALE) / 2,
    maxZ: (rect.y + rect.h) * SCALE - (CANVAS_H * SCALE) / 2,
  };
}

const AGENT_OBSTACLES = [
  ...STATIC_WALLS.map(canvasRectFromWall),
  ...LOUNGE_NAV_OBSTACLES.map(canvasRectFromWall),
  ...STATIC_CANVAS_OBSTACLES,
  ...EMPLOYEE_CHAIR_FIRST_PERSON_OBSTACLES,
];
const FIRST_PERSON_OBSTACLES = [
  ...STATIC_WALLS.map(worldRectFromWall),
  ...LOUNGE_NAV_OBSTACLES.map(worldRectFromWall),
  ...FIRST_PERSON_WORLD_OBSTACLES,
  ...STATIC_CANVAS_OBSTACLES.map(worldRectFromCanvasRect),
  ...EMPLOYEE_CHAIR_FIRST_PERSON_OBSTACLES.map(worldRectFromCanvasRect),
];

function isCanvasPointWalkable(point: CanvasPoint, radius: number): boolean {
  if (
    point.x < AGENT_WALK_MARGIN ||
    point.x > CANVAS_W - AGENT_WALK_MARGIN ||
    point.y < AGENT_WALK_MARGIN ||
    point.y > CANVAS_H - AGENT_WALK_MARGIN
  ) {
    return false;
  }
  return !AGENT_OBSTACLES.some((rect) =>
    circleIntersectsCanvasRect(point, radius, rect),
  );
}

export function isAgentCanvasPointWalkable(
  point: CanvasPoint,
  radius = AGENT_RADIUS,
): boolean {
  return isCanvasPointWalkable(point, radius);
}

function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

function cellCenter(col: number, row: number): CanvasPoint {
  return {
    x: col * AGENT_NAV_CELL + AGENT_NAV_CELL / 2,
    y: row * AGENT_NAV_CELL + AGENT_NAV_CELL / 2,
  };
}

function pointToCell(point: CanvasPoint): { col: number; row: number } {
  return {
    col: THREE.MathUtils.clamp(
      Math.floor(point.x / AGENT_NAV_CELL),
      0,
      Math.floor(CANVAS_W / AGENT_NAV_CELL) - 1,
    ),
    row: THREE.MathUtils.clamp(
      Math.floor(point.y / AGENT_NAV_CELL),
      0,
      Math.floor(CANVAS_H / AGENT_NAV_CELL) - 1,
    ),
  };
}

function nearestWalkableCell(point: CanvasPoint): { col: number; row: number } {
  const start = pointToCell(clampCanvasPoint(point));
  if (isCanvasPointWalkable(cellCenter(start.col, start.row), AGENT_RADIUS)) {
    return start;
  }

  const maxCol = Math.floor(CANVAS_W / AGENT_NAV_CELL) - 1;
  const maxRow = Math.floor(CANVAS_H / AGENT_NAV_CELL) - 1;
  for (let radius = 1; radius < 12; radius += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const col = THREE.MathUtils.clamp(start.col + dc, 0, maxCol);
        const row = THREE.MathUtils.clamp(start.row + dr, 0, maxRow);
        if (isCanvasPointWalkable(cellCenter(col, row), AGENT_RADIUS)) {
          return { col, row };
        }
      }
    }
  }

  return start;
}

function reconstructPath(
  cameFrom: Map<string, string>,
  currentKey: string,
): Array<{ col: number; row: number }> {
  const path: Array<{ col: number; row: number }> = [];
  let key = currentKey;
  while (key) {
    const [col, row] = key.split(":").map(Number);
    path.unshift({ col, row });
    const prev = cameFrom.get(key);
    if (!prev) break;
    key = prev;
  }
  return path;
}

export function findOfficePath(start: CanvasPoint, goal: CanvasPoint): CanvasPoint[] {
  const startCell = nearestWalkableCell(start);
  const goalCell = nearestWalkableCell(goal);
  const startKey = cellKey(startCell.col, startCell.row);
  const goalKey = cellKey(goalCell.col, goalCell.row);
  if (startKey === goalKey) return [goal];

  const maxCol = Math.floor(CANVAS_W / AGENT_NAV_CELL) - 1;
  const maxRow = Math.floor(CANVAS_H / AGENT_NAV_CELL) - 1;
  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([
    [
      startKey,
      Math.abs(startCell.col - goalCell.col) +
        Math.abs(startCell.row - goalCell.row),
    ],
  ]);

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (open.size > 0) {
    let current = "";
    let best = Infinity;
    for (const key of open) {
      const score = fScore.get(key) ?? Infinity;
      if (score < best) {
        best = score;
        current = key;
      }
    }

    if (current === goalKey) {
      const cells = reconstructPath(cameFrom, current);
      const points = cells.slice(1).map(({ col, row }) => cellCenter(col, row));
      points.push(goal);
      return points;
    }

    open.delete(current);
    const [col, row] = current.split(":").map(Number);
    for (const [dc, dr] of neighbors) {
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (nextCol < 0 || nextCol > maxCol || nextRow < 0 || nextRow > maxRow) {
        continue;
      }
      const nextPoint = cellCenter(nextCol, nextRow);
      if (!isCanvasPointWalkable(nextPoint, AGENT_RADIUS)) continue;
      const nextKey = cellKey(nextCol, nextRow);
      const tentative = (gScore.get(current) ?? Infinity) + 1;
      if (tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
      cameFrom.set(nextKey, current);
      gScore.set(nextKey, tentative);
      fScore.set(
        nextKey,
        tentative +
          Math.abs(nextCol - goalCell.col) +
          Math.abs(nextRow - goalCell.row),
      );
      open.add(nextKey);
    }
  }

  return [];
}

export function isFirstPersonWorldWalkable(
  x: number,
  z: number,
  radius = FIRST_PERSON_RADIUS,
): boolean {
  return isFirstPersonWorldWalkableForDoorSensor(x, z, radius, { x, z });
}

function isFirstPersonWorldWalkableForDoorSensor(
  x: number,
  z: number,
  radius: number,
  doorSensor: DoorSensorPoint,
): boolean {
  if (isInsideParkLake(x, z, radius * 0.75)) {
    return false;
  }
  if (
    x < FIRST_PERSON_BOUNDS.minX ||
    x > FIRST_PERSON_BOUNDS.maxX ||
    z < FIRST_PERSON_BOUNDS.minZ ||
    z > FIRST_PERSON_BOUNDS.maxZ
  ) {
    return false;
  }
  if (
    southEntryDoorPanelRects(doorSensor).some((rect) =>
      circleIntersectsWorldRect(x, z, radius, rect),
    )
  ) {
    return false;
  }
  if (
    indoorDoorPanelRects(doorSensor).some((rect) =>
      circleIntersectsWorldRect(x, z, radius, rect),
    )
  ) {
    return false;
  }
  if (
    fastFoodDoorPanelRects(doorSensor).some((rect) =>
      circleIntersectsWorldRect(x, z, radius, rect),
    )
  ) {
    return false;
  }
  if (
    showroomDoorPanelRects(doorSensor).some((rect) =>
      circleIntersectsWorldRect(x, z, radius, rect),
    )
  ) {
    return false;
  }
  return !FIRST_PERSON_OBSTACLES.some((rect) =>
    circleIntersectsWorldRect(x, z, radius, rect),
  );
}

function resolveFirstPersonMoveSegment(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  radius: number,
  doorSensor: DoorSensorPoint,
): THREE.Vector3 {
  const dx = desired.x - current.x;
  const dz = desired.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.0001) {
    return isFirstPersonWorldWalkableForDoorSensor(
      desired.x,
      desired.z,
      radius,
      doorSensor,
    )
      ? desired.clone()
      : current.clone();
  }

  const steps = Math.max(1, Math.ceil(distance / Math.max(radius * 0.45, 0.16)));
  let lastWalkable = current.clone();
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const candidate = desired.clone();
    candidate.x = current.x + dx * t;
    candidate.z = current.z + dz * t;
    if (
      !isFirstPersonWorldWalkableForDoorSensor(
        candidate.x,
        candidate.z,
        radius,
        doorSensor,
      )
    ) {
      return lastWalkable;
    }
    lastWalkable = candidate;
  }
  return desired.clone();
}

export function resolveFirstPersonMove(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  radius = FIRST_PERSON_RADIUS,
): THREE.Vector3 {
  const clamped = desired.clone();
  clamped.x = THREE.MathUtils.clamp(
    clamped.x,
    FIRST_PERSON_BOUNDS.minX,
    FIRST_PERSON_BOUNDS.maxX,
  );
  clamped.z = THREE.MathUtils.clamp(
    clamped.z,
    FIRST_PERSON_BOUNDS.minZ,
    FIRST_PERSON_BOUNDS.maxZ,
  );
  const doorSensor = { x: current.x, z: current.z };

  const direct = resolveFirstPersonMoveSegment(current, clamped, radius, doorSensor);
  if (direct.distanceTo(clamped) <= 0.0001) return direct;

  const slideX = current.clone();
  slideX.x = clamped.x;
  const resolvedX = resolveFirstPersonMoveSegment(
    current,
    slideX,
    radius,
    doorSensor,
  );
  if (resolvedX.distanceTo(slideX) <= 0.0001) return resolvedX;

  const slideZ = current.clone();
  slideZ.z = clamped.z;
  const resolvedZ = resolveFirstPersonMoveSegment(
    current,
    slideZ,
    radius,
    doorSensor,
  );
  if (resolvedZ.distanceTo(slideZ) <= 0.0001) return resolvedZ;

  return direct.distanceTo(current) > 0.0001 ? direct : current.clone();
}
