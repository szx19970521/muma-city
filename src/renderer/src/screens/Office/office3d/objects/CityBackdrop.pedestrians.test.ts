import { describe, expect, it } from "vitest";
import {
  STREET_NPC_ENTRY_AVOIDANCE_ZONE,
  createStreetPedestrianRoutes,
  isStreetPedestrianRouteAllowed,
  resolveScenicNpcRenderState,
  resolveStreetPedestrianPose,
} from "./CityBackdrop";

describe("resolveStreetPedestrianPose", () => {
  it("keeps a one-way heading instead of flipping into a backward walk", () => {
    const first = resolveStreetPedestrianPose({
      start: [-10, 4],
      end: [10, 4],
      elapsed: 1,
      phase: 0.4,
    });
    const later = resolveStreetPedestrianPose({
      start: [-10, 4],
      end: [10, 4],
      elapsed: 15,
      phase: 0.4,
    });

    expect(first.rotationY).toBeCloseTo(Math.PI / 2);
    expect(later.rotationY).toBeCloseTo(Math.PI / 2);
    expect(later.x).toBeGreaterThan(first.x);
  });

  it("waits before the crosswalk while cars have right of way", () => {
    const waiting = resolveStreetPedestrianPose({
      start: [0, -5],
      end: [0, 5],
      elapsed: 8,
      phase: 0,
      crossesRoad: true,
    });
    const crossing = resolveStreetPedestrianPose({
      start: [0, -5],
      end: [0, 5],
      elapsed: 2,
      phase: 0,
      crossesRoad: true,
    });

    expect(waiting.walking).toBe(false);
    expect(waiting.z).toBeCloseTo(-2.8);
    expect(crossing.walking).toBe(true);
  });

  it("uses idle when the pedestrian route has no meaningful movement", () => {
    const pose = resolveStreetPedestrianPose({
      start: [12, 4],
      end: [12, 4],
      elapsed: 3,
      phase: 0,
    });

    expect(pose.walking).toBe(false);
    expect(resolveScenicNpcRenderState({ pose: "idle", role: "pedestrian" })).toBe(
      "standing",
    );
  });

  it("holds at the route end instead of respawning near the observer", () => {
    const pose = resolveStreetPedestrianPose({
      start: [0, 0],
      end: [20, 0],
      elapsed: 28,
      phase: 0,
      observer: { x: 0.8, z: 0 },
    });

    expect(pose.visible).toBe(true);
    expect(pose.walking).toBe(false);
    expect(pose.x).toBeCloseTo(20);
  });

  it("hides the reset when the route start is away from the observer", () => {
    const pose = resolveStreetPedestrianPose({
      start: [0, 0],
      end: [20, 0],
      elapsed: 28,
      phase: 0,
      observer: { x: 60, z: 0 },
    });

    expect(pose.visible).toBe(false);
    expect(pose.walking).toBe(false);
    expect(pose.x).toBeCloseTo(0);
  });
});

describe("street pedestrian routes", () => {
  it("rejects routes through the company entry and front crosswalk avoidance zone", () => {
    expect(
      isStreetPedestrianRouteAllowed({
        start: [0, STREET_NPC_ENTRY_AVOIDANCE_ZONE.minZ - 1],
        end: [0, STREET_NPC_ENTRY_AVOIDANCE_ZONE.maxZ + 1],
        gender: "male",
        topColor: "#334155",
      }),
    ).toBe(false);
  });

  it("generates only purposeful routes outside the company entry zone", () => {
    const routes = createStreetPedestrianRoutes();

    expect(routes.length).toBeGreaterThan(0);
    routes.forEach((route) => {
      expect(isStreetPedestrianRouteAllowed(route)).toBe(true);
      expect(
        Math.hypot(route.end[0] - route.start[0], route.end[1] - route.start[1]),
      ).toBeGreaterThanOrEqual(16);
    });
  });
});

describe("resolveScenicNpcRenderState", () => {
  it("maps walking pedestrians to the walking animation state", () => {
    expect(
      resolveScenicNpcRenderState({ pose: "walking", role: "pedestrian" }),
    ).toBe("walking");
  });

  it("maps waiting pedestrians to the standing animation state", () => {
    expect(
      resolveScenicNpcRenderState({ pose: "idle", role: "pedestrian" }),
    ).toBe("standing");
  });

  it("maps restaurant servers to the tool-use animation state", () => {
    expect(resolveScenicNpcRenderState({ pose: "idle", role: "server" })).toBe(
      "using_tools",
    );
  });
});
