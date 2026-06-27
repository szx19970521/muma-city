import * as THREE from "three";
import { seededRandom } from "./rng";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEATHER_MIN_DURATION_MS = 24 * 60 * 1000;
const WEATHER_DURATION_VARIANCE_MS = 28 * 60 * 1000;

export type WorldWeatherKind = "clear" | "cloudy" | "overcast" | "rain";

export interface WorldWeatherState {
  kind: WorldWeatherKind;
  label: string;
  startsAtMs: number;
  endsAtMs: number;
  progress: number;
  cloudCover: number;
  rainStrength: number;
  fogFactor: number;
  roadWetness: number;
}

export interface WorldTimeState {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  minutesOfDay: number;
  beijingEpochMs: number;
}

export interface WorldSceneState {
  nowMs: number;
  time: WorldTimeState;
  daylight: number;
  twilight: number;
  sunHeight: number;
  sunPosition: [number, number, number];
  moonPosition: [number, number, number];
  isNight: boolean;
  streetLightsOn: boolean;
  vehicleLightsOn: boolean;
  buildingLightsOn: boolean;
  interiorLightBoost: number;
  weather: WorldWeatherState;
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep(min: number, max: number, value: number): number {
  return THREE.MathUtils.smoothstep(value, min, max);
}

function getBeijingTimeState(nowMs: number): WorldTimeState {
  const beijingEpochMs = nowMs + BEIJING_OFFSET_MS;
  const date = new Date(beijingEpochMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    minutesOfDay: hour * 60 + minute + second / 60,
    beijingEpochMs,
  };
}

function makeWeatherForSegment(
  segmentIndex: number,
  startsAtMs: number,
  endsAtMs: number,
  nowMs: number,
): WorldWeatherState {
  const durationMs = endsAtMs - startsAtMs;
  const progress = clamp01((nowMs - startsAtMs) / Math.max(durationMs, 1));
  const roll = seededRandom(segmentIndex * 17.31 + 3.7);
  let kind: WorldWeatherKind = "clear";
  if (roll > 0.86) kind = "rain";
  else if (roll > 0.64) kind = "overcast";
  else if (roll > 0.36) kind = "cloudy";

  switch (kind) {
    case "rain":
      return {
        kind,
        label: "雨天",
        startsAtMs,
        endsAtMs,
        progress,
        cloudCover: 1,
        rainStrength: 0.9,
        fogFactor: 0.82,
        roadWetness: 0.95,
      };
    case "overcast":
      return {
        kind,
        label: "阴天",
        startsAtMs,
        endsAtMs,
        progress,
        cloudCover: 0.88,
        rainStrength: 0,
        fogFactor: 0.72,
        roadWetness: 0.2,
      };
    case "cloudy":
      return {
        kind,
        label: "多云",
        startsAtMs,
        endsAtMs,
        progress,
        cloudCover: 0.46,
        rainStrength: 0,
        fogFactor: 0.38,
        roadWetness: 0,
      };
    default:
      return {
        kind,
        label: "晴天",
        startsAtMs,
        endsAtMs,
        progress,
        cloudCover: 0.08,
        rainStrength: 0,
        fogFactor: 0.16,
        roadWetness: 0,
      };
  }
}

function getWeatherState(beijingEpochMs: number): WorldWeatherState {
  const startBucketMs =
    Math.floor((beijingEpochMs - DAY_MS) / DAY_MS) * DAY_MS - DAY_MS;
  let segmentIndex = 0;
  let segmentStart = startBucketMs;

  while (segmentStart < beijingEpochMs + DAY_MS) {
    const durationMs =
      WEATHER_MIN_DURATION_MS +
      Math.floor(
        seededRandom(segmentIndex * 29.13 + 11.2) * WEATHER_DURATION_VARIANCE_MS,
      );
    const segmentEnd = segmentStart + durationMs;
    if (beijingEpochMs < segmentEnd) {
      return makeWeatherForSegment(
        segmentIndex,
        segmentStart,
        segmentEnd,
        beijingEpochMs,
      );
    }
    segmentStart = segmentEnd;
    segmentIndex += 1;
  }

  return makeWeatherForSegment(
    segmentIndex,
    segmentStart,
    segmentStart + WEATHER_MIN_DURATION_MS,
    beijingEpochMs,
  );
}

export function buildWorldSceneState(nowMs: number): WorldSceneState {
  const time = getBeijingTimeState(nowMs);
  const weather = getWeatherState(time.beijingEpochMs);

  // 06:00 east horizon -> 12:00 zenith -> 18:00 west horizon -> midnight below.
  const orbit = ((time.minutesOfDay - 360) / 1440) * Math.PI * 2;
  const sunHeight = Math.sin(orbit);
  const daylight = smoothstep(-0.16, 0.22, sunHeight);
  const twilight = 1 - Math.min(1, Math.abs(sunHeight) / 0.24);
  const radius = 110;
  const horizonDrift = 18 + weather.cloudCover * 14;
  const sunPosition: [number, number, number] = [
    -Math.cos(orbit) * radius,
    sunHeight * 74,
    horizonDrift,
  ];
  const moonPosition: [number, number, number] = [
    Math.cos(orbit) * radius,
    -sunHeight * 62,
    -12,
  ];

  const isNight = daylight < 0.26;
  const streetLightsOn = isNight || weather.kind === "rain";
  const buildingLightsOn = isNight;
  const vehicleLightsOn = isNight || weather.kind === "rain";
  const interiorLightBoost = THREE.MathUtils.lerp(
    1.05,
    weather.kind === "rain" ? 1.26 : 1.38,
    Math.max(1 - daylight, weather.rainStrength * 0.6),
  );

  return {
    nowMs,
    time,
    daylight,
    twilight,
    sunHeight,
    sunPosition,
    moonPosition,
    isNight,
    streetLightsOn,
    vehicleLightsOn,
    buildingLightsOn,
    interiorLightBoost,
    weather,
  };
}
