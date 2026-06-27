import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_SEAT_BACK,
  GLASS_DOOR_PANELS,
  GLASS_WALLS,
  LOUNGE_NAV_OBSTACLES,
} from "../layout";
import { WORLD_H } from "./constants";
import {
  BANK_X,
  BANK_Z,
  PARK_CLEARING,
  PARK_LAKE,
  ROAD_SOUTH_Z,
  SHOWROOM_D,
  SHOWROOM_W,
  SHOWROOM_X,
  SHOWROOM_Z,
  rectIntersectsParkClearing,
} from "./cityPlan";
import { getBackdropBuildingFootprints } from "./backdropBuildingFootprints";
import { toWorld } from "./geometry";
import {
  findOfficePath,
  isAgentCanvasPointWalkable,
  isFirstPersonWorldWalkable,
  resolveFirstPersonMove,
} from "./navigationCollision";
import {
  DRIVABLE_PARKED_CAR,
  resolveVehicleExitPosition,
} from "./drivableVehicles";
import * as THREE from "three";

function worldPoint(cx: number, cy: number): { x: number; z: number } {
  const [x, , z] = toWorld(cx, cy);
  return { x, z };
}

describe("office navigation collision", () => {
  it("keeps employee seats far enough back from the desk edge for rigged sitting", () => {
    expect(EMPLOYEE_SEAT_BACK).toBeGreaterThanOrEqual(44);
  });

  it("blocks first-person movement through lounge furniture", () => {
    expect(LOUNGE_NAV_OBSTACLES.length).toBeGreaterThan(0);

    for (const rect of LOUNGE_NAV_OBSTACLES) {
      const center = worldPoint(rect.x + rect.w / 2, rect.y + rect.h / 2);
      expect(
        isFirstPersonWorldWalkable(center.x, center.z, 0.35),
        rect.id,
      ).toBe(false);
    }
  });

  it("blocks agent pathing through lounge furniture", () => {
    expect(LOUNGE_NAV_OBSTACLES.length).toBeGreaterThan(0);

    for (const rect of LOUNGE_NAV_OBSTACLES) {
      expect(
        isAgentCanvasPointWalkable({
          x: rect.x + rect.w / 2,
          y: rect.y + rect.h / 2,
        }),
        rect.id,
      ).toBe(false);
    }
  });

  it("keeps the lounge aisle walkable", () => {
    const aisle = worldPoint(1480, 1260);

    expect(isFirstPersonWorldWalkable(aisle.x, aisle.z, 0.35)).toBe(true);
  });

  it("keeps the company south automatic doorway open while blocking side wall panes", () => {
    const southDoorZ = WORLD_H / 2;

    expect(isFirstPersonWorldWalkable(0, southDoorZ, 0.35)).toBe(true);
    expect(isFirstPersonWorldWalkable(3.6, southDoorZ, 0.35)).toBe(false);
  });

  it("does not tunnel through the company south automatic door from outside sensor range", () => {
    const southDoorZ = WORLD_H / 2;
    const start = new THREE.Vector3(0, 0, southDoorZ + 4.9);
    const desired = new THREE.Vector3(0, 0, southDoorZ - 1.2);

    const resolved = resolveFirstPersonMove(start, desired, 0.35);

    expect(resolved.z).toBeGreaterThan(southDoorZ + 0.25);
    expect(resolved.distanceTo(desired)).toBeGreaterThan(1);
  });

  it("lets the company south automatic door pass once the player is at the sensor", () => {
    const southDoorZ = WORLD_H / 2;
    const start = new THREE.Vector3(0, 0, southDoorZ + 0.62);
    const desired = new THREE.Vector3(0, 0, southDoorZ - 1.2);

    const resolved = resolveFirstPersonMove(start, desired, 0.35);

    expect(resolved.z).toBeCloseTo(desired.z);
  });

  it("keeps indoor automatic glass doorways open while blocking fixed glass walls", () => {
    const door = GLASS_DOOR_PANELS[0];
    const doorCenter = worldPoint(door.x + door.w / 2, door.y + door.h / 2);
    const wall = GLASS_WALLS[0];
    const wallCenter = worldPoint(wall.x + wall.w / 2, wall.y + wall.h / 2);

    expect(isFirstPersonWorldWalkable(doorCenter.x, doorCenter.z, 0.35)).toBe(true);
    expect(isFirstPersonWorldWalkable(wallCenter.x, wallCenter.z, 0.35)).toBe(false);
  });

  it("does not tunnel through fixed glass walls on large movement steps", () => {
    const passableWallCrossing = GLASS_WALLS.map((wall) => {
      const wallCenter = worldPoint(wall.x + wall.w / 2, wall.y + wall.h / 2);
      const horizontal = wall.w >= wall.h;
      return {
        start: new THREE.Vector3(
          wallCenter.x + (horizontal ? 0 : -1.2),
          0,
          wallCenter.z + (horizontal ? -1.2 : 0),
        ),
        desired: new THREE.Vector3(
          wallCenter.x + (horizontal ? 0 : 1.2),
          0,
          wallCenter.z + (horizontal ? 1.2 : 0),
        ),
      };
    }).find(
      ({ start, desired }) =>
        isFirstPersonWorldWalkable(start.x, start.z, 0.35) &&
        isFirstPersonWorldWalkable(desired.x, desired.z, 0.35),
    );

    expect(passableWallCrossing).toBeTruthy();
    const { start, desired } = passableWallCrossing!;

    const resolved = resolveFirstPersonMove(start, desired, 0.35);

    expect(resolved.distanceTo(desired)).toBeGreaterThan(0.5);
    expect(isFirstPersonWorldWalkable(resolved.x, resolved.z, 0.35)).toBe(true);
  });

  it("blocks the tool room cabinet without leaving the old floor-button air wall", () => {
    const cabinet = worldPoint(1515, 1758);
    const oldShortcutArea = worldPoint(1415, 1695);

    expect(isFirstPersonWorldWalkable(cabinet.x, cabinet.z, 0.35)).toBe(false);
    expect(isAgentCanvasPointWalkable({ x: 1515, y: 1758 })).toBe(false);
    expect(isFirstPersonWorldWalkable(oldShortcutArea.x, oldShortcutArea.z, 0.35)).toBe(
      true,
    );
  });

  it("blocks first-person movement through workstation chairs", () => {
    const firstChair = worldPoint(95 + 75, 220 - EMPLOYEE_SEAT_BACK);

    expect(isFirstPersonWorldWalkable(firstChair.x, firstChair.z, 0.35)).toBe(
      false,
    );
  });

  it("blocks agent pathing through workstation chair bodies", () => {
    const firstChair = { x: 95 + 75, y: 220 - EMPLOYEE_SEAT_BACK };

    expect(isAgentCanvasPointWalkable(firstChair, 14)).toBe(false);
  });

  it("keeps workstation seats reachable while avoiding chair bodies en route", () => {
    const seat = { x: 95 + 75, y: 220 - EMPLOYEE_SEAT_BACK };
    const path = findOfficePath({ x: 420, y: 640 }, seat);

    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual(seat);
    for (const point of path.slice(0, -1)) {
      expect(isAgentCanvasPointWalkable(point, 14)).toBe(true);
    }
  });

  it("slides instead of entering lounge furniture", () => {
    const start = worldPoint(1480, 1260);
    const blocked = LOUNGE_NAV_OBSTACLES.find((rect) =>
      rect.id.includes("rest-couch-east"),
    );
    expect(blocked).toBeTruthy();
    const desired = worldPoint(
      blocked!.x + blocked!.w / 2,
      blocked!.y + blocked!.h / 2,
    );

    const resolved = resolveFirstPersonMove(
      new THREE.Vector3(start.x, 0, start.z),
      new THREE.Vector3(desired.x, 0, desired.z),
      0.35,
    );

    expect(resolved.distanceTo(new THREE.Vector3(desired.x, 0, desired.z))).toBeGreaterThan(
      0.01,
    );
    expect(isFirstPersonWorldWalkable(resolved.x, resolved.z, 0.35)).toBe(true);
  });

  it("blocks standalone city buildings without blocking the road grid", () => {
    const generated = getBackdropBuildingFootprints().find(
      (building) => building.id === "gb:1,4",
    );
    expect(generated).toBeTruthy();

    expect(isFirstPersonWorldWalkable(generated!.x, generated!.z, 0.35)).toBe(false);
    expect(isFirstPersonWorldWalkable(BANK_X, BANK_Z, 0.35)).toBe(false);
    expect(isFirstPersonWorldWalkable(0, ROAD_SOUTH_Z, 0.35)).toBe(true);
  });

  it("keeps northwest lake park free of generated building footprints", () => {
    const footprints = getBackdropBuildingFootprints();

    expect(
      footprints.some((building) =>
        rectIntersectsParkClearing(
          building.x,
          building.z,
          building.w / 2,
          building.d / 2,
          0.2,
        ),
      ),
    ).toBe(false);

    expect(
      footprints.some((building) => building.id === "gb:1,4"),
    ).toBe(true);
  });

  it("blocks the lake water while keeping the park greenway walkable", () => {
    expect(isFirstPersonWorldWalkable(PARK_LAKE.x, PARK_LAKE.z, 0.35)).toBe(false);

    const greenwaySamples = [
      [PARK_LAKE.x + PARK_LAKE.rx + 1.25, PARK_LAKE.z],
      [PARK_LAKE.x - PARK_LAKE.rx - 1.25, PARK_LAKE.z],
      [PARK_CLEARING.x, PARK_CLEARING.z + PARK_CLEARING.rz - 0.85],
      [PARK_CLEARING.x + 4.6, PARK_CLEARING.z + 5.6],
    ] as const;

    for (const [x, z] of greenwaySamples) {
      expect(isFirstPersonWorldWalkable(x, z, 0.35), `${x},${z}`).toBe(true);
    }
  });

  it("slides at the visible lake edge instead of moving into the water", () => {
    const start = new THREE.Vector3(PARK_LAKE.x + PARK_LAKE.rx + 1.6, 0, PARK_LAKE.z);
    const desired = new THREE.Vector3(PARK_LAKE.x, 0, PARK_LAKE.z);
    const resolved = resolveFirstPersonMove(start, desired, 0.35);

    expect(resolved.distanceTo(desired)).toBeGreaterThan(0.5);
    expect(isFirstPersonWorldWalkable(resolved.x, resolved.z, 0.35)).toBe(true);
  });

  it("keeps the car showroom glass solid while leaving the automatic doorway open", () => {
    const frontX = SHOWROOM_X + SHOWROOM_W / 2;

    expect(isFirstPersonWorldWalkable(frontX, SHOWROOM_Z, 0.35)).toBe(true);
    expect(
      isFirstPersonWorldWalkable(frontX, SHOWROOM_Z + SHOWROOM_D / 2 - 1.2, 0.35),
    ).toBe(false);
  });

  it("blocks first-person movement through showroom cars and entrance plants", () => {
    const frontX = SHOWROOM_X + SHOWROOM_W / 2;

    expect(isFirstPersonWorldWalkable(SHOWROOM_X + 1.5, SHOWROOM_Z, 0.35)).toBe(
      false,
    );
    expect(isFirstPersonWorldWalkable(SHOWROOM_X - 4, SHOWROOM_Z - 7, 0.35)).toBe(
      false,
    );
    expect(isFirstPersonWorldWalkable(frontX + 0.8, SHOWROOM_Z + 3.2, 0.35)).toBe(
      false,
    );
    expect(isFirstPersonWorldWalkable(frontX, SHOWROOM_Z, 0.35)).toBe(true);
  });

  it("keeps at least one validated drivable-car exit point", () => {
    const [x, , z] = DRIVABLE_PARKED_CAR.position;

    expect(isFirstPersonWorldWalkable(x, z, 0.35)).toBe(true);

    const exit = resolveVehicleExitPosition(DRIVABLE_PARKED_CAR, (exitX, exitZ) =>
      isFirstPersonWorldWalkable(exitX, exitZ, 0.42),
    );

    expect(exit).toBeTruthy();
    expect(isFirstPersonWorldWalkable(exit!.x, exit!.z, 0.42)).toBe(true);
  });
});
