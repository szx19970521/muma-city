import * as THREE from "three";
import { buildWorldSceneState, type WorldSceneState } from "./worldState";

// The world's day/night look (floor, walls, lighting) is driven by the system
// clock, NOT the app's UI theme, so future 3D worlds can reuse this same
// time-of-day model. Only the canvas background follows the app theme.
export interface WorldPalette {
  floor: string;
  rug: string;
  wallNS: string;
  wallEW: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambient: number;
  directional: number;
  // Image-based-lighting (Lightformer environment) strength + warmth. With
  // ACES tone mapping the punchier directional + soft IBL replace the old flat
  // fill, so ambient/hemi are dialled down to avoid washing the scene out.
  envIntensity: number;
  keyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMieCoefficient: number;
  skyMieDirectionalG: number;
  moonColor: string;
  moonIntensity: number;
  rainColor: string;
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function lerp(min: number, max: number, t: number): number {
  return THREE.MathUtils.lerp(min, max, clamp01(t));
}

function mixColor(from: string, to: string, t: number): string {
  const color = new THREE.Color(from);
  color.lerp(new THREE.Color(to), clamp01(t));
  return `#${color.getHexString()}`;
}

function withWeatherCast(base: string, cast: string, amount: number): string {
  return mixColor(base, cast, clamp01(amount));
}

export function getWorldPalette(world: WorldSceneState): WorldPalette {
  const daylight = clamp01(world.daylight);
  const twilight = clamp01(world.twilight);
  const night = clamp01(1 - daylight);
  const nightMix = Math.pow(night, 0.72);
  const cloud = clamp01(world.weather.cloudCover);
  const rain = clamp01(world.weather.rainStrength);
  const fog = clamp01(world.weather.fogFactor);
  const wetness = clamp01(world.weather.roadWetness);
  const overcast = clamp01(cloud * 0.78 + rain * 0.42);
  const dampCast = clamp01(rain * 0.48 + wetness * 0.22);
  const warmTwilight =
    twilight * clamp01(1 - daylight * 0.82) * (1 - cloud * 0.45);
  const skyGlow = Math.max(daylight, twilight * 0.58);

  const floor = withWeatherCast(
    mixColor("#d2d0c8", "#77818e", nightMix),
    "#868f91",
    dampCast,
  );
  const rug = withWeatherCast(
    mixColor("#b8c0c7", "#68727e", nightMix),
    "#74818c",
    dampCast * 0.86,
  );
  const wallNS = withWeatherCast(
    mixColor("#dedbd2", "#717b88", nightMix * 0.9),
    "#8b969e",
    overcast * 0.25 + dampCast * 0.16,
  );
  const wallEW = withWeatherCast(
    mixColor("#d7d7d1", "#687381", nightMix * 0.94),
    "#838f98",
    overcast * 0.28 + dampCast * 0.14,
  );

  const hemiSky = withWeatherCast(
    mixColor(
      mixColor("#f7fbff", "#ffc890", warmTwilight * 0.68),
      "#25395f",
      nightMix,
    ),
    "#617286",
    overcast * 0.64,
  );
  const hemiGround = withWeatherCast(
    mixColor("#c1c7cf", "#313b4a", nightMix),
    "#485362",
    overcast * 0.54,
  );

  const hemiIntensity = THREE.MathUtils.clamp(
    0.2 + daylight * 0.2 + twilight * 0.08 + cloud * 0.05 + rain * 0.06,
    0.2,
    0.46,
  );
  const ambient = THREE.MathUtils.clamp(
    0.22 + nightMix * 0.19 + cloud * 0.05 + rain * 0.07,
    0.22,
    0.48,
  );
  const directional = THREE.MathUtils.clamp(
    (0.3 + skyGlow * 1.62) * lerp(1, 0.58, cloud) * lerp(1, 0.84, rain),
    0.3,
    1.84,
  );
  const envIntensity = THREE.MathUtils.clamp(
    0.44 + daylight * 0.18 + nightMix * 0.13 + cloud * 0.05 + rain * 0.08,
    0.44,
    0.78,
  );

  const keyColor = withWeatherCast(
    mixColor("#dce8ff", "#fff4e2", skyGlow),
    "#c9d6e4",
    overcast * 0.38,
  );
  const fogColor = withWeatherCast(
    mixColor(
      mixColor("#d6dde5", "#f0b178", warmTwilight * 0.45),
      "#14213a",
      nightMix,
    ),
    "#536477",
    fog * 0.56 + rain * 0.18,
  );

  return {
    floor,
    rug,
    wallNS,
    wallEW,
    hemiSky,
    hemiGround,
    hemiIntensity,
    ambient,
    directional,
    envIntensity,
    keyColor,
    fogColor,
    fogNear: lerp(100, 64, fog * 0.72 + rain * 0.12),
    fogFar: lerp(340, 220, fog),
    skyTurbidity: lerp(4, 8.8, cloud) + rain * 1.9,
    skyRayleigh: lerp(0.22, 1.45, daylight) * lerp(1, 0.6, cloud),
    skyMieCoefficient: lerp(0.0055, 0.017, cloud) + rain * 0.004,
    skyMieDirectionalG: lerp(0.79, 0.92, cloud),
    moonColor: withWeatherCast(
      mixColor("#ecd59a", "#fff1ca", 0.36 + nightMix * 0.26 + twilight * 0.04),
      "#d9deea",
      overcast * 0.18,
    ),
    moonIntensity: THREE.MathUtils.clamp(
      (0.06 + nightMix * 0.34 + twilight * 0.05) * lerp(1, 0.62, cloud),
      0.04,
      0.4,
    ),
    rainColor: withWeatherCast("#b9d3ff", "#dce8ff", rain * 0.24 + cloud * 0.1),
  };
}

const DAY_REFERENCE_WORLD: WorldSceneState = (() => {
  const world = buildWorldSceneState(Date.UTC(2026, 5, 16, 4, 0, 0));
  return {
    ...world,
    daylight: 1,
    twilight: 0,
    sunHeight: 1,
    sunPosition: [0, 74, 18],
    moonPosition: [0, -62, -12],
    isNight: false,
    streetLightsOn: false,
    vehicleLightsOn: false,
    buildingLightsOn: false,
    interiorLightBoost: 1.05,
    weather: {
      ...world.weather,
      kind: "clear",
      label: "晴天",
      progress: 0.5,
      cloudCover: 0.08,
      rainStrength: 0,
      fogFactor: 0.16,
      roadWetness: 0,
    },
  };
})();

// Back-compat alias while Office3D and other call sites migrate.
export const deriveWorldPalette = getWorldPalette;

// Stable clear-noon fallback kept for older call sites that still expect a
// constant palette object. Dynamic scenes should call getWorldPalette().
export const DAY_PALETTE: WorldPalette = getWorldPalette(DAY_REFERENCE_WORLD);
