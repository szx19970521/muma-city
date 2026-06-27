import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import car1GlbUrl from "../assets/car1.glb?url";
import car2GlbUrl from "../assets/car2.glb?url";
import truck1GlbUrl from "../assets/truck1.glb?url";
import { seededRandom } from "../core/rng";
import { vehicleClone, normalizeFootprint } from "../core/glb";
import type { WorldSceneState } from "../core/worldState";
import {
  ROADS,
  ROAD_SOUTH_Z,
  ROAD_WIDTH,
  ROAD_Y,
  TRAFFIC_LEN,
} from "../core/cityPlan";

export { car1GlbUrl, car2GlbUrl, truck1GlbUrl };

export const VEHICLE_TINTS = [
  "#b03a2e", // red
  "#1f618d", // blue
  "#239b56", // green
  "#d4ac0d", // yellow
  "#6c3483", // purple
  "#ca6f1e", // orange
  "#e8e8e8", // white
  "#39414f", // gunmetal
];

interface TrafficVehicle {
  url: string;
  tint: string;
  /** Footprint length in world units after normalisation. */
  targetLen: number;
  /** Per-model heading compensation so traffic faces its travel direction. */
  yawOffset: number;
  /** Axis the vehicle travels along ("x" = E-W roads, "z" = N-S roads). */
  axis: "x" | "z";
  /** The road centre this lane belongs to. */
  roadCenter: number;
  /** Fixed cross-axis coordinate: road centre plus its lane offset. */
  fixed: number;
  dir: 1 | -1;
  speed: number;
  /** Live position along the road in [-TRAFFIC_LEN/2, TRAFFIC_LEN/2]. */
  s: number;
}

interface LaneSnapshot {
  vehicle: TrafficVehicle;
  progress: number;
}

const LOOP_HALF = TRAFFIC_LEN / 2;
const LOOP_LEN = TRAFFIC_LEN;
const SOUTH_GATE_CROSSING_X = 0;
const SOUTH_GATE_CROSSING_HALF_WIDTH = 2.2;
const SOUTH_GATE_STOP_BUFFER = 0.9;
const FOLLOW_GAP = 1.8;
const SOUTH_GATE_SIGNAL_CYCLE = 16;
const SOUTH_GATE_STOP_PHASE = 5;
const POSITION_EPS = 1e-3;
const SOUTH_GATE_TRAFFIC_COUNT = 5;
const DEFAULT_TRAFFIC_COUNT = 6;

function getVehicleLightMix(world?: WorldSceneState | null): number {
  if (!world?.vehicleLightsOn) return 0;
  return THREE.MathUtils.clamp(
    Math.max(1 - world.daylight, world.weather.rainStrength * 0.68) +
      (world.isNight ? 0.08 : 0),
    0,
    1,
  );
}

function makeTraffic(): TrafficVehicle[] {
  const lane = ROAD_WIDTH / 4; // centre of each carriageway half
  const vehicles: TrafficVehicle[] = [];
  let seed = 0;
  for (const road of ROADS) {
    const perRoad =
      Math.abs(road.center - ROAD_SOUTH_Z) < POSITION_EPS && road.axis === "x"
        ? SOUTH_GATE_TRAFFIC_COUNT
        : DEFAULT_TRAFFIC_COUNT;
    for (let i = 0; i < perRoad; i++) {
      seed += 1;
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const roll = seededRandom(seed * 7 + 1);
      const isTruck = roll > 0.78;
      const url = isTruck
        ? truck1GlbUrl
        : roll > 0.39
          ? car2GlbUrl
          : car1GlbUrl;
      vehicles.push({
        url,
        tint: VEHICLE_TINTS[
          Math.floor(seededRandom(seed * 11 + 2) * VEHICLE_TINTS.length)
        ],
        targetLen: isTruck ? 3.4 : 2.3,
        yawOffset: url === car1GlbUrl ? Math.PI : 0,
        axis: road.axis,
        roadCenter: road.center,
        // Two-way traffic: each direction drives in its own lane.
        fixed: road.center + dir * lane,
        dir,
        speed: (isTruck ? 3.2 : 4.5) + seededRandom(seed * 13 + 3) * 2.2,
        s:
          -TRAFFIC_LEN / 2 +
          ((i + seededRandom(seed * 17 + 4) * 0.6) / perRoad) * TRAFFIC_LEN,
      });
    }
  }
  return vehicles;
}

function progressOf(vehicle: TrafficVehicle): number {
  return vehicle.dir > 0 ? vehicle.s + LOOP_HALF : LOOP_HALF - vehicle.s;
}

function sFromProgress(vehicle: TrafficVehicle, progress: number): number {
  let wrapped = progress % LOOP_LEN;
  if (wrapped < 0) wrapped += LOOP_LEN;
  return vehicle.dir > 0 ? wrapped - LOOP_HALF : LOOP_HALF - wrapped;
}

function isSouthGateLane(vehicle: TrafficVehicle): boolean {
  return (
    vehicle.axis === "x" &&
    Math.abs(vehicle.roadCenter - ROAD_SOUTH_Z) < POSITION_EPS
  );
}

function southGateStopProgress(vehicle: TrafficVehicle): number {
  const stopS =
    vehicle.dir > 0
      ? SOUTH_GATE_CROSSING_X -
        SOUTH_GATE_CROSSING_HALF_WIDTH -
        vehicle.targetLen / 2 -
        SOUTH_GATE_STOP_BUFFER
      : SOUTH_GATE_CROSSING_X +
        SOUTH_GATE_CROSSING_HALF_WIDTH +
        vehicle.targetLen / 2 +
        SOUTH_GATE_STOP_BUFFER;
  return vehicle.dir > 0 ? stopS + LOOP_HALF : LOOP_HALF - stopS;
}

function getLeaderAhead(
  current: LaneSnapshot,
  lane: LaneSnapshot[],
): { leader: TrafficVehicle; aheadProgress: number } | null {
  let leader: TrafficVehicle | null = null;
  let aheadProgress = Infinity;
  for (const other of lane) {
    if (other.vehicle === current.vehicle) continue;
    let candidate = other.progress;
    if (candidate <= current.progress + POSITION_EPS) candidate += LOOP_LEN;
    if (candidate < aheadProgress) {
      aheadProgress = candidate;
      leader = other.vehicle;
    }
  }
  return leader ? { leader, aheadProgress } : null;
}

/**
 * A tinted, footprint-normalised vehicle. Also used by the car showroom for
 * its display cars, so the whole world shares one vehicle pipeline.
 */
export function VehicleModel({
  url,
  tint,
  targetLen,
}: {
  url: string;
  tint: string;
  targetLen: number;
}): React.JSX.Element {
  const { scene } = useGLTF(url, false, false);
  const object = useMemo(
    () => normalizeFootprint(vehicleClone(scene, tint), targetLen, true),
    [scene, tint, targetLen],
  );
  return <primitive object={object} />;
}

export function VehicleRainSheen({
  strength,
  targetLen,
}: {
  strength: number;
  targetLen: number;
}): React.JSX.Element | null {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const visibleStrength = THREE.MathUtils.clamp(strength, 0, 1);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    const group = groupRef.current;
    if (!material || !group) return;
    const pulse = 0.5 + Math.sin(clock.elapsedTime * 7.2) * 0.5;
    material.opacity = (0.08 + pulse * 0.18) * visibleStrength;
    group.position.z =
      -targetLen * 0.18 + ((clock.elapsedTime * 0.72) % 1) * targetLen * 0.36;
  });

  if (visibleStrength <= 0.02) return null;

  return (
    <group ref={groupRef} position={[0, 0.48, 0]}>
      {[-0.23, 0, 0.23].map((x, index) => (
        <mesh
          key={`vehicle-rain-sheen-${index}`}
          position={[x, 0, (index - 1) * 0.22]}
          rotation={[-Math.PI / 2, 0, -0.14]}
          renderOrder={3}
        >
          <planeGeometry args={[0.18, targetLen * 0.34]} />
          <meshStandardMaterial
            ref={index === 1 ? materialRef : undefined}
            color="#d9ecff"
            emissive="#b9dcff"
            emissiveIntensity={0.22}
            transparent
            opacity={0.14 * visibleStrength}
            depthWrite={false}
            toneMapped={false}
            roughness={0.2}
            metalness={0.06}
          />
        </mesh>
      ))}
    </group>
  );
}

function TrafficVehicleInstance({
  vehicle,
  lightMix,
  rainStrength,
}: {
  vehicle: TrafficVehicle;
  lightMix: number;
  rainStrength: number;
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const s = vehicle.s;
    if (vehicle.axis === "x") {
      g.position.set(s, ROAD_Y, vehicle.fixed);
      g.rotation.y =
        (vehicle.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + vehicle.yawOffset;
    } else {
      g.position.set(vehicle.fixed, ROAD_Y, s);
      g.rotation.y = (vehicle.dir > 0 ? 0 : Math.PI) + vehicle.yawOffset;
    }
  });
  return (
    <group
      ref={groupRef}
      userData={{ aimashiCollisionRadius: vehicle.targetLen > 3 ? 1.35 : 0.95 }}
    >
      <VehicleModel
        url={vehicle.url}
        tint={vehicle.tint}
        targetLen={vehicle.targetLen}
      />
      <VehicleRainSheen strength={rainStrength} targetLen={vehicle.targetLen} />
      <VehicleLightRig vehicle={vehicle} lightMix={lightMix} />
    </group>
  );
}

/** Cars / trucks looping on backdrop roads with a light south-gate stop phase. */
function VehicleLightRig({
  vehicle,
  lightMix,
}: {
  vehicle: TrafficVehicle;
  lightMix: number;
}): React.JSX.Element | null {
  if (lightMix <= 0.001) return null;

  const isTruck = vehicle.targetLen > 3;
  const halfTrack = isTruck ? 0.38 : 0.29;
  const lampY = isTruck ? 0.23 : 0.18;
  const frontZ = vehicle.targetLen / 2 - 0.06;
  const rearZ = -vehicle.targetLen / 2 + 0.08;
  const headlightIntensity = THREE.MathUtils.lerp(1.3, 3.1, lightMix);
  const tailLightIntensity = THREE.MathUtils.lerp(0.95, 2.05, lightMix);
  const headGlowOpacity = THREE.MathUtils.lerp(0.18, 0.54, lightMix);
  const tailGlowOpacity = THREE.MathUtils.lerp(0.16, 0.44, lightMix);
  const headGlowWidth = isTruck ? 0.18 : 0.15;
  const tailGlowWidth = isTruck ? 0.15 : 0.12;

  return (
    <group rotation={[0, vehicle.yawOffset, 0]}>
      {[-1, 1].map((side) => (
        <group key={`head-${side}`} position={[side * halfTrack, lampY, frontZ]}>
          <mesh>
            <boxGeometry args={[0.09, 0.055, 0.022]} />
            <meshStandardMaterial
              color="#fff9e8"
              emissive="#fff4c9"
              emissiveIntensity={headlightIntensity}
              toneMapped={false}
              roughness={0.18}
              metalness={0.04}
            />
          </mesh>
          <mesh position={[0, 0, 0.018]} renderOrder={2}>
            <planeGeometry args={[headGlowWidth, headGlowWidth * 0.68]} />
            <meshStandardMaterial
              color="#fff7dc"
              emissive="#fff4cf"
              emissiveIntensity={headlightIntensity * 0.55}
              toneMapped={false}
              transparent
              opacity={headGlowOpacity}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group
          key={`tail-${side}`}
          position={[side * (halfTrack * 0.92), lampY * 0.94, rearZ]}
        >
          <mesh>
            <boxGeometry args={[0.075, 0.05, 0.02]} />
            <meshStandardMaterial
              color="#ffb0ab"
              emissive="#ff5448"
              emissiveIntensity={tailLightIntensity}
              toneMapped={false}
              roughness={0.22}
              metalness={0.04}
            />
          </mesh>
          <mesh position={[0, 0, -0.016]} renderOrder={2}>
            <planeGeometry args={[tailGlowWidth, tailGlowWidth * 0.58]} />
            <meshStandardMaterial
              color="#ffb3aa"
              emissive="#ff5f54"
              emissiveIntensity={tailLightIntensity * 0.48}
              toneMapped={false}
              transparent
              opacity={tailGlowOpacity}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export const TrafficLayer = memo(function TrafficLayer({
  world,
}: {
  world?: WorldSceneState | null;
}): React.JSX.Element {
  const vehicles = useRef<TrafficVehicle[]>(makeTraffic());
  const lightMix = getVehicleLightMix(world);
  const rainStrength =
    world?.weather.kind === "rain" ? world.weather.rainStrength : 0;

  useFrame(({ clock }, delta) => {
    const step = Math.min(delta, 0.05);
    const southGateStopActive =
      clock.elapsedTime % SOUTH_GATE_SIGNAL_CYCLE < SOUTH_GATE_STOP_PHASE;
    const lanes = new Map<string, TrafficVehicle[]>();

    for (const vehicle of vehicles.current) {
      const key = `${vehicle.axis}:${vehicle.fixed}:${vehicle.dir}`;
      const lane = lanes.get(key);
      if (lane) lane.push(vehicle);
      else lanes.set(key, [vehicle]);
    }

    for (const laneVehicles of lanes.values()) {
      const snapshots = laneVehicles.map((vehicle) => ({
        vehicle,
        progress: progressOf(vehicle),
      }));
      const nextProgress = new Map<TrafficVehicle, number>();

      for (const snapshot of snapshots) {
        let desiredProgress = snapshot.progress + snapshot.vehicle.speed * step;

        if (southGateStopActive && isSouthGateLane(snapshot.vehicle)) {
          const stopProgress = southGateStopProgress(snapshot.vehicle);
          const stopAhead =
            stopProgress < snapshot.progress - POSITION_EPS
              ? stopProgress + LOOP_LEN
              : stopProgress;
          desiredProgress = Math.min(desiredProgress, stopAhead);
        }

        const leaderAhead = getLeaderAhead(snapshot, snapshots);
        if (leaderAhead) {
          const minGap =
            (snapshot.vehicle.targetLen + leaderAhead.leader.targetLen) / 2 +
            FOLLOW_GAP;
          desiredProgress = Math.min(
            desiredProgress,
            leaderAhead.aheadProgress - minGap,
          );
        }

        nextProgress.set(
          snapshot.vehicle,
          Math.max(snapshot.progress, desiredProgress),
        );
      }

      for (const [vehicle, progress] of nextProgress) {
        vehicle.s = sFromProgress(vehicle, progress);
      }
    }
  });

  return (
    <>
      {vehicles.current.map((v, i) => (
        <TrafficVehicleInstance
          key={`veh-${i}`}
          vehicle={v}
          lightMix={lightMix}
          rainStrength={rainStrength}
        />
      ))}
    </>
  );
});

useGLTF.preload(car1GlbUrl, false, false);
useGLTF.preload(car2GlbUrl, false, false);
useGLTF.preload(truck1GlbUrl, false, false);
