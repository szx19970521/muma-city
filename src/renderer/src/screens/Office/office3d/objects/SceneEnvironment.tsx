import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Environment, Lightformer, Sky } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorldPalette, type WorldPalette } from "../core/palette";
import { WORLD_H, WORLD_W } from "../core/constants";
import { seededRandom } from "../core/rng";
import { buildWorldSceneState, type WorldSceneState } from "../core/worldState";

const LIVE_WORLD_TICK_MS = 15_000;
const RAIN_FIELD_AREA = 156;
const RAIN_FIELD_HEIGHT = 44;
const RAIN_DROP_COUNT = 640;
const RAIN_LAYER_COUNT = 3;
const RAIN_LAYER_GAP = 20;
const RAIN_OFFICE_CLEARANCE_X = WORLD_W / 2 + 1.6;
const RAIN_OFFICE_CLEARANCE_Z = WORLD_H / 2 + 1.6;
const STAR_COUNT = 680;
const STAR_FIELD_RADIUS = 320;

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function isInsideOfficeRainShadow(x: number, z: number): boolean {
  return (
    Math.abs(x) < RAIN_OFFICE_CLEARANCE_X &&
    Math.abs(z) < RAIN_OFFICE_CLEARANCE_Z
  );
}

function outdoorRainPosition(seed: number): [number, number] {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const x =
      (seededRandom(seed * 2.17 + attempt * 11.3 + 11) - 0.5) *
      RAIN_FIELD_AREA;
    const z =
      (seededRandom(seed * 2.71 + attempt * 13.9 + 47) - 0.5) *
      RAIN_FIELD_AREA;
    if (!isInsideOfficeRainShadow(x, z)) return [x, z];
  }

  const edgeX =
    seededRandom(seed * 3.11 + 83) > 0.5
      ? RAIN_OFFICE_CLEARANCE_X
      : -RAIN_OFFICE_CLEARANCE_X;
  const x = edgeX + (seededRandom(seed * 3.37 + 89) - 0.5) * 28;
  const z = (seededRandom(seed * 3.79 + 107) - 0.5) * RAIN_FIELD_AREA;
  return [x, z];
}

function useLiveWorldSceneState(world?: WorldSceneState): WorldSceneState {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (world) return;

    const syncClock = (): void => {
      setNowMs(Date.now());
    };

    syncClock();
    const timer = window.setInterval(syncClock, LIVE_WORLD_TICK_MS);
    return () => window.clearInterval(timer);
  }, [world]);

  const liveWorld = useMemo(() => buildWorldSceneState(nowMs), [nowMs]);
  return world ?? liveWorld;
}

function RainField({
  color,
  strength,
}: {
  color: string;
  strength: number;
}): React.JSX.Element | null {
  const layerRefs = useRef<Array<THREE.Group | null>>([]);
  const travel = RAIN_FIELD_HEIGHT + RAIN_LAYER_GAP;
  const visibleStrength = clamp01(strength);

  const geometry = useMemo(() => {
    const positions = new Float32Array(RAIN_DROP_COUNT * 2 * 3);
    for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
      const start = i * 6;
      const [x, z] = outdoorRainPosition(i);
      const y = seededRandom(i * 2.11 + 29) * RAIN_FIELD_HEIGHT;
      const length = 1.6 + seededRandom(i * 3.07 + 71) * 1.8;
      const driftX = 0.26 + seededRandom(i * 3.43 + 89) * 0.36;
      const driftZ = 0.08 + seededRandom(i * 3.91 + 107) * 0.18;
      positions[start] = x;
      positions[start + 1] = y;
      positions[start + 2] = z;
      positions[start + 3] = x - driftX;
      positions[start + 4] = y - length;
      positions[start + 5] = z + driftZ;
    }

    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return rainGeometry;
  }, []);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame(({ clock }) => {
    if (visibleStrength <= 0.02) return;

    const speed = 12 + visibleStrength * 22;
    for (let index = 0; index < RAIN_LAYER_COUNT; index += 1) {
      const layer = layerRefs.current[index];
      if (!layer) continue;
      const phase = (travel / RAIN_LAYER_COUNT) * index;
      layer.position.y =
        RAIN_LAYER_GAP - ((clock.elapsedTime * speed + phase) % travel);
    }
  });

  if (visibleStrength <= 0.02) return null;

  const opacity = 0.1 + visibleStrength * 0.24;

  return (
    <group position={[0, 6, 0]}>
      {Array.from({ length: RAIN_LAYER_COUNT }).map((_, index) => (
        <group
          key={index}
          ref={(value) => {
            layerRefs.current[index] = value;
          }}
          position={[0, (travel / RAIN_LAYER_COUNT) * index, 0]}
        >
          <lineSegments geometry={geometry} rotation={[0.06, 0, -0.08]}>
            <lineBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function NightStars({
  baseColor,
  visibility,
}: {
  baseColor: string;
  visibility: number;
}): React.JSX.Element | null {
  const clampedVisibility = clamp01(visibility);
  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const warm = new THREE.Color(baseColor);
    const cool = new THREE.Color("#dbe5ff");
    const starColor = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i += 1) {
      const theta = seededRandom(i * 13.17 + 5.1) * Math.PI * 2;
      const height = THREE.MathUtils.lerp(
        0.1,
        0.96,
        Math.pow(seededRandom(i * 17.39 + 9.7), 0.58),
      );
      const y = height * STAR_FIELD_RADIUS;
      const xzRadius = Math.sqrt(
        Math.max(STAR_FIELD_RADIUS * STAR_FIELD_RADIUS - y * y, 0),
      );
      const sparkle = seededRandom(i * 29.13 + 2.4);
      const brightness =
        0.56 +
        seededRandom(i * 19.61 + 14.3) * 0.42 +
        (sparkle > 0.94 ? 0.36 : 0);
      const warmth =
        seededRandom(i * 23.41 + 17.2) * (sparkle > 0.84 ? 0.58 : 0.36);

      positions[i * 3] = Math.cos(theta) * xzRadius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * xzRadius;

      starColor.copy(warm).lerp(cool, warmth).multiplyScalar(brightness);
      colors[i * 3] = starColor.r;
      colors[i * 3 + 1] = starColor.g;
      colors[i * 3 + 2] = starColor.b;
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    starGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    return starGeometry;
  }, [baseColor]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  if (clampedVisibility <= 0.03) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={1.05}
        sizeAttenuation={false}
        vertexColors
        transparent
        opacity={0.28 + clampedVisibility * 0.58}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </points>
  );
}

function MoonBody({
  color,
  opacity,
  position,
}: {
  color: string;
  opacity: number;
  position: [number, number, number];
}): React.JSX.Element {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");

    if (context) {
      const base = context.createRadialGradient(104, 100, 20, 128, 128, 124);
      base.addColorStop(0, "#ffffff");
      base.addColorStop(0.56, "#e3dfd6");
      base.addColorStop(1, "#bcb6ab");
      context.fillStyle = base;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.globalCompositeOperation = "multiply";
      for (let i = 0; i < 15; i += 1) {
        const x = 34 + seededRandom(i * 7.13 + 1.9) * 188;
        const y = 36 + seededRandom(i * 9.07 + 3.7) * 184;
        const radius = 10 + seededRandom(i * 11.41 + 6.1) * 28;
        const crater = context.createRadialGradient(
          x - radius * 0.22,
          y - radius * 0.22,
          radius * 0.16,
          x,
          y,
          radius,
        );
        crater.addColorStop(0, "rgba(92, 88, 78, 0.7)");
        crater.addColorStop(0.58, "rgba(142, 136, 122, 0.24)");
        crater.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = crater;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }

      const limbShade = context.createLinearGradient(38, 0, 226, 0);
      limbShade.addColorStop(0, "rgba(0, 0, 0, 0.18)");
      limbShade.addColorStop(0.34, "rgba(0, 0, 0, 0.02)");
      limbShade.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = limbShade;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
    }

    const moonTexture = new THREE.CanvasTexture(canvas);
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    return moonTexture;
  }, []);

  useEffect(() => {
    return () => texture.dispose();
  }, [texture]);

  return (
    <group position={position}>
      <mesh scale={4.4}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color={color}
          map={texture}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Sky, fog and the full lighting rig. If a world state is not supplied yet,
 * the environment derives one from the system clock so day/night still moves.
 */
export const SceneEnvironment = memo(function SceneEnvironment({
  world,
  palette,
}: {
  world?: WorldSceneState;
  palette?: WorldPalette;
}): React.JSX.Element {
  const liveWorld = useLiveWorldSceneState(world);
  const derivedPalette = useMemo(() => getWorldPalette(liveWorld), [liveWorld]);
  const effectivePalette = world ? (palette ?? derivedPalette) : derivedPalette;
  const sunStrength = Math.max(liveWorld.daylight, liveWorld.twilight * 0.58);
  const sunIntensity = effectivePalette.directional * sunStrength;
  const moonOpacity = clamp01(
    (1 - liveWorld.daylight) * (1 - liveWorld.weather.cloudCover * 0.72),
  );
  const moonVisible =
    liveWorld.moonPosition[1] > 0 && moonOpacity > 0.05 && !liveWorld.isNight
      ? liveWorld.twilight > 0.08
      : liveWorld.moonPosition[1] > 0 && moonOpacity > 0.05;
  const starVisibility = clamp01(
    THREE.MathUtils.smoothstep(1 - liveWorld.daylight, 0.74, 0.98) *
      (1 - liveWorld.weather.cloudCover * 0.45) *
      (1 - liveWorld.weather.rainStrength * 0.62),
  );
  const environmentKey = [
    liveWorld.time.hour,
    Math.floor(liveWorld.time.minute / 10),
    liveWorld.weather.kind,
    liveWorld.isNight ? "night" : "day",
  ].join("-");

  return (
    <>
      <Sky
        distance={420}
        sunPosition={liveWorld.sunPosition}
        turbidity={effectivePalette.skyTurbidity}
        rayleigh={effectivePalette.skyRayleigh}
        mieCoefficient={effectivePalette.skyMieCoefficient}
        mieDirectionalG={effectivePalette.skyMieDirectionalG}
      />
      <fog
        attach="fog"
        args={[
          effectivePalette.fogColor,
          effectivePalette.fogNear,
          effectivePalette.fogFar,
        ]}
      />
      <Environment
        key={environmentKey}
        frames={1}
        resolution={256}
        background={false}
      >
        <Lightformer
          form="rect"
          intensity={effectivePalette.envIntensity}
          color={effectivePalette.keyColor}
          position={[0, 22, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[42, 42, 1]}
        />
        <Lightformer
          form="rect"
          intensity={effectivePalette.envIntensity * 0.72}
          color={effectivePalette.hemiSky}
          position={[0, 10, 28]}
          rotation={[0, 0, 0]}
          scale={[40, 16, 1]}
        />
        <Lightformer
          form="rect"
          intensity={effectivePalette.envIntensity * 0.48}
          color={effectivePalette.moonColor}
          position={[-26, 10, -4]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[36, 15, 1]}
        />
        <Lightformer
          form="rect"
          intensity={effectivePalette.envIntensity * 0.48}
          color={effectivePalette.hemiGround}
          position={[26, 10, -4]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[36, 15, 1]}
        />
        {liveWorld.weather.kind === "rain" ? (
          <Lightformer
            form="rect"
            intensity={effectivePalette.envIntensity * 0.24}
            color={effectivePalette.rainColor}
            position={[0, 6, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[54, 54, 1]}
          />
        ) : null}
      </Environment>
      <hemisphereLight
        args={[
          effectivePalette.hemiSky,
          effectivePalette.hemiGround,
          effectivePalette.hemiIntensity,
        ]}
      />
      <ambientLight intensity={effectivePalette.ambient} />
      <directionalLight
        position={liveWorld.sunPosition}
        intensity={sunIntensity}
        color={effectivePalette.keyColor}
        castShadow={sunIntensity > 0.16}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
      />
      <directionalLight
        position={liveWorld.moonPosition}
        intensity={effectivePalette.moonIntensity}
        color={effectivePalette.moonColor}
      />
      <NightStars
        baseColor={effectivePalette.moonColor}
        visibility={starVisibility}
      />
      {moonVisible ? (
        <MoonBody
          color={effectivePalette.moonColor}
          opacity={moonOpacity}
          position={liveWorld.moonPosition}
        />
      ) : null}
      <RainField
        color={effectivePalette.rainColor}
        strength={
          liveWorld.weather.kind === "rain" ? liveWorld.weather.rainStrength : 0
        }
      />
    </>
  );
});
