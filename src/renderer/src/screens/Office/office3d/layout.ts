/**
 * Office layout in "canvas" space (0..1800 on both axes), matching the agent
 * simulation. A vertical partition splits the floor into a west **work area**
 * (one desk per agent) and an east **rest room** (lounge seating where agents
 * whose gateway is off go to sit). `facing` values are in radians.
 */

export type FurnitureType =
  | "desk"
  | "executiveDesk"
  | "executiveChair"
  | "chair"
  | "couch"
  | "sofaChair"
  | "beanbag"
  | "plant"
  | "whitePot"
  | "computer"
  | "pantry";

export interface FurniturePlacement {
  id: string;
  type: FurnitureType;
  /** Canvas-space placement point; interpreted by each furniture model's origin. */
  x: number;
  y: number;
  facingDeg: number;
  /** Optional tint override; `undefined` uses the type default, `null` keeps the model's own colors. */
  tint?: string | null;
  /** Optional per-piece scale adjustment for executive furniture tuning. */
  scaleMultiplier?: number;
  /** Optional per-piece vertical offset override. */
  yOffset?: number;
  /** Optional procedural display variant for furniture that shares a semantic type. */
  variant?: "softBeanbag";
}

export interface WallSegment {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GlassRoom {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GlassDoorPanel extends WallSegment {
  label: string;
}

export interface Seat {
  x: number;
  y: number;
  facing: number;
}

export interface Workstation {
  id: string;
  agentId: string | null;
  deskX: number;
  deskY: number;
  deskFacingDeg: number;
  chairX: number;
  chairY: number;
  chairFacingDeg: number;
  seatX: number;
  seatY: number;
  seatFacing: number;
  /** The CEO's desk: rendered larger, tinted, and flanked with plants. */
  isExecutive?: boolean;
  /** Empty desks keep the office populated while waiting for future agents. */
  isVacant?: boolean;
}

// ── Partition between work area (west) and rest room (east) ────────────────
export const DIVIDER_X = 1180;
// Doorway gap in the partition (agents pass through here between rooms).
export const DOOR_Y_MIN = 820;
export const DOOR_Y_MAX = 1000;
export const DOOR_Y = (DOOR_Y_MIN + DOOR_Y_MAX) / 2;

const PARTITION_THICKNESS = 16;

export const INTERIOR_WALLS: WallSegment[] = [];

export const MEETING_ROOM: GlassRoom = {
  id: "meeting-room",
  label: "会议室",
  minX: 1210,
  maxX: 1760,
  minY: 40,
  maxY: 768,
};

export const LOUNGE_ROOM: GlassRoom = {
  id: "lounge-room",
  label: "休息室",
  minX: 1210,
  maxX: 1760,
  minY: 768,
  maxY: 1620,
};

export const TOOL_ROOM: GlassRoom = {
  id: "tool-room",
  label: "工具室",
  minX: 1210,
  maxX: 1760,
  minY: 1620,
  maxY: 1790,
};

export const GYM_ROOM: GlassRoom = {
  id: "gym-room",
  label: "健身房",
  minX: 760,
  maxX: 1194,
  minY: 40,
  maxY: 320,
};

// ── Desks (work area, west of the partition) ───────────────────────────────
const COLS = 3;
const MIN_VISIBLE_EMPLOYEE_WORKSTATIONS = 12;
const ORIGIN_X = 95;
const ORIGIN_Y = 220;
const SPACING_X = 245;
const SPACING_Y = 235;
const DESK_W = 150;
const CHAIR_FOOTPRINT = 24;

// ── CEO executive desk ─────────────────────────────────────────────────────
// The CEO gets a private glass-walled corner office in the south-west of the
// work area (see CEO_OFFICE / GLASS_WALLS below), set apart from the employee
// grid which fills the rows to the north, with surrounding decor
// (EXECUTIVE_DECOR).
//
// NOTE: ceo_desk.glb is modelled with its origin at the footprint CENTRE
// (unlike employee desk.glb, whose origin is a back corner), so CEO_DESK_X/Y is
// the desk's centre point — not its top-left. The seat sits due north of that
// centre, just clear of the desk's back edge: half the model depth (0.847 world
// units × 0.85 desk scale ÷ 2 ÷ SCALE ≈ 20 canvas) plus a small clearance gap.
export const CEO_DESK_X = 300;
export const CEO_DESK_Y = 1305;
export const CEO_SEAT_BACK = 92;
export const EMPLOYEE_SEAT_BACK = 46;
export const CEO_TEA_TABLE_X = 255;
export const CEO_TEA_TABLE_Y = 1545;

// ── CEO glass corner office (south-west of the work area) ──────────────────
// The west and south sides are the building's perimeter walls; the north and
// east sides are clear glass partitions. The doorway gap sits in the east
// glass wall, on the straight walk-in line from the spawn point so agents
// (which have no pathfinder) enter without clipping a pane.
export const CEO_OFFICE = {
  minX: 40,
  maxX: 560,
  minY: 1150,
  maxY: 1790,
  doorYMin: 1440,
  doorYMax: 1620,
};
export const CEO_DOOR_Y = (CEO_OFFICE.doorYMin + CEO_OFFICE.doorYMax) / 2;

export const MEETING_DOOR_Y_MIN = 350;
export const MEETING_DOOR_Y_MAX = 530;
export const LOUNGE_DOOR_Y_MIN = 1070;
export const LOUNGE_DOOR_Y_MAX = 1250;
export const TOOL_ROOM_DOOR_Y_MIN = 1665;
export const TOOL_ROOM_DOOR_Y_MAX = 1765;
export const GYM_DOOR_X_MIN = 805;
export const GYM_DOOR_X_MAX = 955;
const SHARED_ROOM_DOOR_X_MIN = 1410;
const SHARED_ROOM_DOOR_X_MAX = 1570;

export const GLASS_ROOMS: GlassRoom[] = [
  GYM_ROOM,
  MEETING_ROOM,
  LOUNGE_ROOM,
  TOOL_ROOM,
  {
    id: "manager-office",
    label: "总经理办公室",
    minX: CEO_OFFICE.minX,
    maxX: CEO_OFFICE.maxX,
    minY: CEO_OFFICE.minY,
    maxY: CEO_OFFICE.maxY,
  },
];

export const GLASS_WALLS: WallSegment[] = [
  {
    id: "gym-glass-north",
    x: GYM_ROOM.minX,
    y: GYM_ROOM.minY,
    w: GYM_ROOM.maxX - GYM_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "gym-glass-west",
    x: GYM_ROOM.minX,
    y: GYM_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: GYM_ROOM.maxY - GYM_ROOM.minY,
  },
  {
    id: "gym-glass-east",
    x: GYM_ROOM.maxX - PARTITION_THICKNESS,
    y: GYM_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: GYM_ROOM.maxY - GYM_ROOM.minY,
  },
  {
    id: "gym-glass-south-left",
    x: GYM_ROOM.minX,
    y: GYM_ROOM.maxY - PARTITION_THICKNESS,
    w: GYM_DOOR_X_MIN - GYM_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "gym-glass-south-right",
    x: GYM_DOOR_X_MAX,
    y: GYM_ROOM.maxY - PARTITION_THICKNESS,
    w: GYM_ROOM.maxX - GYM_DOOR_X_MAX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "meeting-glass-north",
    x: MEETING_ROOM.minX,
    y: MEETING_ROOM.minY,
    w: MEETING_ROOM.maxX - MEETING_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "meeting-glass-west",
    x: MEETING_ROOM.minX,
    y: MEETING_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: MEETING_DOOR_Y_MIN - MEETING_ROOM.minY,
  },
  {
    id: "meeting-glass-west-bottom",
    x: MEETING_ROOM.minX,
    y: MEETING_DOOR_Y_MAX,
    w: PARTITION_THICKNESS,
    h: MEETING_ROOM.maxY - MEETING_DOOR_Y_MAX,
  },
  {
    id: "meeting-glass-east",
    x: MEETING_ROOM.maxX - PARTITION_THICKNESS,
    y: MEETING_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: MEETING_ROOM.maxY - MEETING_ROOM.minY,
  },
  {
    id: "meeting-glass-south-left",
    x: MEETING_ROOM.minX,
    y: MEETING_ROOM.maxY - PARTITION_THICKNESS,
    w: SHARED_ROOM_DOOR_X_MIN - MEETING_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "meeting-glass-south-right",
    x: SHARED_ROOM_DOOR_X_MAX,
    y: MEETING_ROOM.maxY - PARTITION_THICKNESS,
    w: MEETING_ROOM.maxX - SHARED_ROOM_DOOR_X_MAX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "lounge-glass-south",
    x: LOUNGE_ROOM.minX,
    y: LOUNGE_ROOM.maxY - PARTITION_THICKNESS,
    w: LOUNGE_ROOM.maxX - LOUNGE_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "lounge-glass-east",
    x: LOUNGE_ROOM.maxX - PARTITION_THICKNESS,
    y: LOUNGE_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: LOUNGE_ROOM.maxY - LOUNGE_ROOM.minY,
  },
  {
    id: "lounge-glass-west-top",
    x: LOUNGE_ROOM.minX,
    y: LOUNGE_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: LOUNGE_DOOR_Y_MIN - LOUNGE_ROOM.minY,
  },
  {
    id: "lounge-glass-west-bottom",
    x: LOUNGE_ROOM.minX,
    y: LOUNGE_DOOR_Y_MAX,
    w: PARTITION_THICKNESS,
    h: LOUNGE_ROOM.maxY - LOUNGE_DOOR_Y_MAX,
  },
  {
    id: "tool-glass-north",
    x: TOOL_ROOM.minX,
    y: TOOL_ROOM.minY,
    w: TOOL_ROOM.maxX - TOOL_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "tool-glass-south",
    x: TOOL_ROOM.minX,
    y: TOOL_ROOM.maxY - PARTITION_THICKNESS,
    w: TOOL_ROOM.maxX - TOOL_ROOM.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "tool-glass-east",
    x: TOOL_ROOM.maxX - PARTITION_THICKNESS,
    y: TOOL_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: TOOL_ROOM.maxY - TOOL_ROOM.minY,
  },
  {
    id: "tool-glass-west-top",
    x: TOOL_ROOM.minX,
    y: TOOL_ROOM.minY,
    w: PARTITION_THICKNESS,
    h: TOOL_ROOM_DOOR_Y_MIN - TOOL_ROOM.minY,
  },
  {
    id: "tool-glass-west-bottom",
    x: TOOL_ROOM.minX,
    y: TOOL_ROOM_DOOR_Y_MAX,
    w: PARTITION_THICKNESS,
    h: TOOL_ROOM.maxY - TOOL_ROOM_DOOR_Y_MAX,
  },
  {
    id: "ceo-glass-north",
    x: CEO_OFFICE.minX,
    y: CEO_OFFICE.minY - PARTITION_THICKNESS / 2,
    w: CEO_OFFICE.maxX - CEO_OFFICE.minX,
    h: PARTITION_THICKNESS,
  },
  {
    id: "ceo-glass-east-top",
    x: CEO_OFFICE.maxX - PARTITION_THICKNESS / 2,
    y: CEO_OFFICE.minY,
    w: PARTITION_THICKNESS,
    h: CEO_OFFICE.doorYMin - CEO_OFFICE.minY,
  },
  {
    id: "ceo-glass-east-bottom",
    x: CEO_OFFICE.maxX - PARTITION_THICKNESS / 2,
    y: CEO_OFFICE.doorYMax,
    w: PARTITION_THICKNESS,
    h: CEO_OFFICE.maxY - CEO_OFFICE.doorYMax,
  },
];

export const GLASS_DOOR_PANELS: GlassDoorPanel[] = [
  {
    id: "gym-room-door",
    label: "健身房",
    x: GYM_DOOR_X_MIN,
    y: GYM_ROOM.maxY - PARTITION_THICKNESS,
    w: GYM_DOOR_X_MAX - GYM_DOOR_X_MIN,
    h: PARTITION_THICKNESS,
  },
  {
    id: "meeting-room-door",
    label: "会议室",
    x: MEETING_ROOM.minX,
    y: MEETING_DOOR_Y_MIN,
    w: PARTITION_THICKNESS,
    h: MEETING_DOOR_Y_MAX - MEETING_DOOR_Y_MIN,
  },
  {
    id: "lounge-room-door",
    label: "休息室",
    x: LOUNGE_ROOM.minX,
    y: LOUNGE_DOOR_Y_MIN,
    w: PARTITION_THICKNESS,
    h: LOUNGE_DOOR_Y_MAX - LOUNGE_DOOR_Y_MIN,
  },
  {
    id: "tool-room-door",
    label: "工具室",
    x: TOOL_ROOM.minX,
    y: TOOL_ROOM_DOOR_Y_MIN,
    w: PARTITION_THICKNESS,
    h: TOOL_ROOM_DOOR_Y_MAX - TOOL_ROOM_DOOR_Y_MIN,
  },
  {
    id: "manager-office-door",
    label: "总经理办公室",
    x: CEO_OFFICE.maxX - PARTITION_THICKNESS / 2,
    y: CEO_OFFICE.doorYMin,
    w: PARTITION_THICKNESS,
    h: CEO_OFFICE.doorYMax - CEO_OFFICE.doorYMin,
  },
];

function buildEmployeeWorkstation(
  agentId: string | null,
  index: number,
  totalSlots: number,
): Workstation {
  const col = index % COLS;
  const rowFromFront = Math.floor(index / COLS);
  const totalRows = Math.ceil(totalSlots / COLS);
  const row = totalRows - rowFromFront - 1;
  const deskX = ORIGIN_X + col * SPACING_X;
  const deskY = ORIGIN_Y + row * SPACING_Y;

  const seatX = deskX + DESK_W / 2;
  // Modern employee benches are wider and deeper than the old single desk.
  // The seat remains on the north side, facing south into the workstation.
  const seatY = deskY - EMPLOYEE_SEAT_BACK;
  const seatFacing = 0; // Faces South towards the desk

  return {
    id: agentId ? `desk-${index}` : `vacant-desk-${index}`,
    agentId,
    deskX,
    deskY,
    deskFacingDeg: 0, // Desk extends North, drawers are on the North side
    // Chair footprint is centered under the agent
    chairX: seatX - CHAIR_FOOTPRINT / 2,
    chairY: seatY - CHAIR_FOOTPRINT / 2,
    chairFacingDeg: 0, // Faces South
    seatX,
    seatY,
    seatFacing,
    isVacant: agentId == null,
  };
}

function buildCeoWorkstation(agentId: string): Workstation {
  // CEO_DESK_X/Y is the desk's CENTRE (see note above). Seat the agent on the
  // same vertical axis, north of the desk's back edge, facing south into it.
  const seatX = CEO_DESK_X;
  const seatY = CEO_DESK_Y - CEO_SEAT_BACK;
  const deskCenterX = CEO_DESK_X;
  const deskCenterY = CEO_DESK_Y;
  const seatFacing = Math.atan2(deskCenterX - seatX, deskCenterY - seatY);

  return {
    id: "desk-ceo",
    agentId,
    deskX: CEO_DESK_X,
    deskY: CEO_DESK_Y,
    deskFacingDeg: 0,
    chairX: seatX - CHAIR_FOOTPRINT / 2,
    chairY: seatY - CHAIR_FOOTPRINT / 2,
    chairFacingDeg: (seatFacing * 180) / Math.PI,
    seatX,
    seatY,
    seatFacing,
    isExecutive: true,
  };
}

/**
 * One desk per agent. Employees fill a grid; the CEO (if any) gets a separate
 * executive desk and is removed from the grid so it doesn't leave a gap.
 */
export function buildWorkstations(
  agentIds: string[],
  ceoId?: string | null,
): Workstation[] {
  const hasCeo = ceoId != null && agentIds.includes(ceoId);
  const employees = hasCeo ? agentIds.filter((id) => id !== ceoId) : agentIds;

  const visibleEmployeeSlots = Math.max(
    MIN_VISIBLE_EMPLOYEE_WORKSTATIONS,
    employees.length,
  );
  const stations = Array.from({ length: visibleEmployeeSlots }, (_, index) =>
    buildEmployeeWorkstation(employees[index] ?? null, index, visibleEmployeeSlots),
  );
  if (hasCeo) stations.push(buildCeoWorkstation(ceoId));
  return stations;
}

/**
 * Decorative furniture inside the CEO's glass corner office, rendered only
 * when a CEO exists: a visitor lounge (couch + two leather guest armchairs
 * around the coffee table — the table itself is rendered in Office3D),
 * greenery along the west wall and planters flanking the doorway. The desk
 * also gets two flanking plants from the executive workstation.
 */
export const EXECUTIVE_DECOR: FurniturePlacement[] = [
  // Visitor couch grouped to the south-west so the east-side entry stays open.
  {
    id: "ceo-couch",
    type: "couch",
    x: 175,
    y: 1605,
    facingDeg: 180,
    tint: "#4b3528",
    scaleMultiplier: 1.14,
  },
  // Guest chairs cluster around the tea table while keeping the door-side
  // circulation open.
  {
    id: "ceo-guest-chair-west",
    type: "sofaChair",
    x: 130,
    y: 1505,
    facingDeg: 78,
    tint: "#6b4a36",
    scaleMultiplier: 1.03,
  },
  {
    id: "ceo-guest-chair-east",
    type: "sofaChair",
    x: 350,
    y: 1515,
    facingDeg: 288,
    tint: "#6b4a36",
    scaleMultiplier: 1.03,
  },
  // Greenery along the west (window) wall.
  {
    id: "ceo-plant-nw",
    type: "plant",
    x: CEO_OFFICE.minX + 35,
    y: CEO_OFFICE.minY + 70,
    facingDeg: 0,
  },
  {
    id: "ceo-plant-sw",
    type: "plant",
    x: CEO_OFFICE.minX + 35,
    y: CEO_OFFICE.maxY - 110,
    facingDeg: 0,
  },
  // White planters just inside the glass door.
  {
    id: "ceo-whitepot-door-north",
    type: "whitePot",
    x: CEO_OFFICE.maxX - 60,
    y: CEO_OFFICE.doorYMin - 60,
    facingDeg: 0,
  },
  {
    id: "ceo-whitepot-door-south",
    type: "whitePot",
    x: CEO_OFFICE.maxX - 60,
    y: CEO_OFFICE.doorYMax + 20,
    facingDeg: 0,
  },
];

// ── Rest room (east of the partition) ──────────────────────────────────────
const REST_CENTER_X = 1480;
const REST_CENTER_Y = 1190;

// Beanbag seat centers — agents whose gateway is off sit here.
const BEANBAG_CENTERS: Array<[number, number]> = [
  [1360, 960],
  [1480, 1035],
  [1605, 960],
  [1360, 1190],
  [1605, 1190],
  [1480, 1350],
  [1360, 1430],
  [1605, 1430],
];

const BEANBAG_TINTS = [
  "#5a4870",
  "#53436a",
  "#3d5575",
  "#6b4f3a",
  "#4a5568",
  "#6b5a45",
  "#7b341e",
  "#2d6048",
];

function facingToCenter(x: number, y: number): number {
  return Math.atan2(REST_CENTER_X - x, REST_CENTER_Y - y);
}

/** Seats agents sit on while resting (one per beanbag). */
export const REST_SEATS: Seat[] = BEANBAG_CENTERS.map(([x, y]) => ({
  x,
  y,
  facing: facingToCenter(x, y),
}));

/** All rest-room furniture: a beanbag per seat plus decorative couch + plant. */
export const REST_FURNITURE: FurniturePlacement[] = [
  ...BEANBAG_CENTERS.map(([x, y], i) => ({
    id: `beanbag-${i}`,
    type: "beanbag" as const,
    x,
    y,
    facingDeg: (facingToCenter(x, y) * 180) / Math.PI,
    tint: BEANBAG_TINTS[i % BEANBAG_TINTS.length],
    variant: "softBeanbag" as const,
  })),
  { id: "rest-couch", type: "couch", x: 1485, y: 1530, facingDeg: 0 },
  {
    id: "rest-couch-east",
    type: "couch",
    x: 1685,
    y: 1110,
    facingDeg: 270,
    tint: "#3f4f63",
    scaleMultiplier: 1.08,
  },
  {
    id: "rest-armchair-nw",
    type: "sofaChair",
    x: 1305,
    y: 1015,
    facingDeg: 52,
    tint: "#6b4a36",
    scaleMultiplier: 0.98,
  },
  {
    id: "rest-armchair-sw",
    type: "sofaChair",
    x: 1305,
    y: 1365,
    facingDeg: 128,
    tint: "#6b4a36",
    scaleMultiplier: 0.98,
  },
  { id: "rest-pantry", type: "pantry", x: 1675, y: 1495, facingDeg: 30 },
  { id: "rest-plant-1", type: "whitePot", x: 1695, y: 860, facingDeg: 0 },
  { id: "rest-plant-2", type: "whitePot", x: 1275, y: 860, facingDeg: 0 },
  { id: "rest-plant-sw", type: "plant", x: 1245, y: 1545, facingDeg: 0 },
  { id: "rest-plant-east", type: "plant", x: 1715, y: 1285, facingDeg: 0 },
  { id: "rest-whitepot-south", type: "whitePot", x: 1605, y: 1575, facingDeg: 0 },
];

const LOUNGE_COLLISION_FOOTPRINT: Partial<
  Record<FurnitureType, { w: number; h: number; origin?: "corner" | "center" }>
> = {
  beanbag: { w: 58, h: 58, origin: "center" },
  couch: { w: 116, h: 58, origin: "corner" },
  sofaChair: { w: 72, h: 72, origin: "center" },
  pantry: { w: 122, h: 90, origin: "center" },
  plant: { w: 38, h: 38, origin: "center" },
  whitePot: { w: 38, h: 38, origin: "center" },
};

function loungeCollisionRect(piece: FurniturePlacement): WallSegment | null {
  const footprint = LOUNGE_COLLISION_FOOTPRINT[piece.type];
  if (!footprint) return null;
  const scale = piece.scaleMultiplier ?? 1;
  const w = footprint.w * scale;
  const h = footprint.h * scale;
  const rad = ((piece.facingDeg % 180) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotatedW = w * cos + h * sin;
  const rotatedH = w * sin + h * cos;
  const centerX =
    footprint.origin === "corner" ? piece.x + rotatedW / 2 : piece.x;
  const centerY =
    footprint.origin === "corner" ? piece.y + rotatedH / 2 : piece.y;
  return {
    id: `lounge-${piece.id}`,
    x: centerX - rotatedW / 2,
    y: centerY - rotatedH / 2,
    w: rotatedW,
    h: rotatedH,
  };
}

export const LOUNGE_NAV_OBSTACLES: WallSegment[] = REST_FURNITURE.map(
  loungeCollisionRect,
).filter((rect): rect is WallSegment => Boolean(rect));

export const MANAGER_OFFICE_FURNITURE: FurniturePlacement[] = [
  {
    id: "manager-desk",
    type: "executiveDesk",
    x: CEO_DESK_X,
    y: CEO_DESK_Y,
    facingDeg: 0,
    tint: null,
    scaleMultiplier: 1.06,
  },
  {
    id: "manager-chair",
    type: "executiveChair",
    x: CEO_DESK_X,
    y: CEO_DESK_Y - CEO_SEAT_BACK,
    facingDeg: 0,
    tint: "#221d18",
    scaleMultiplier: 1,
  },
  {
    id: "manager-desk-plant-left",
    type: "plant",
    x: CEO_DESK_X - 145,
    y: CEO_DESK_Y + 18,
    facingDeg: 0,
  },
  {
    id: "manager-desk-plant-right",
    type: "plant",
    x: CEO_DESK_X + 195,
    y: CEO_DESK_Y + 18,
    facingDeg: 0,
  },
];
