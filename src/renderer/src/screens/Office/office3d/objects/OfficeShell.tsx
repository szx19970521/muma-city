import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import woodenTableGlbUrl from "../assets/wooden_table.glb?url";
import { WORLD_W, WORLD_H, SCALE } from "../core/constants";
import { toWorld } from "../core/geometry";
import { glbClone, normalizeFootprint } from "../core/glb";
import type { WorldPalette } from "../core/palette";
import type { WorldSceneState } from "../core/worldState";
import type { RenderAgent } from "../core/types";
import {
  INTERIOR_WALLS,
  GLASS_WALLS,
  GLASS_DOOR_PANELS,
  CEO_OFFICE,
  CEO_DESK_X,
  CEO_TEA_TABLE_X,
  CEO_TEA_TABLE_Y,
} from "../layout";

const ROOM_WALL_H = 4.15;
const ROOM_WALL_T = 0.2;
const BASEBOARD_H = 0.16;
const BASEBOARD_T = 0.045;
const CHAIR_RAIL_H = 1.18;
const SOUTH_ENTRY_DOOR_W = 4.6;
const SOUTH_ENTRY_DOOR_H = 3.04;
const SOUTH_ENTRY_DOOR_PANEL_GAP = 0.08;
const SOUTH_ENTRY_DOOR_SLIDE = 0.92;
const SOUTH_ENTRY_PAD_D = 1.62;
const ROOF_SLAB_Y = -0.024;
const ROOF_SLAB_H = 0.048;
const HELIPAD_MARKING_LIFT = 0.004;
const SOUTH_ENTRY_SENSOR_HALF_W = 3.7;
const SOUTH_ENTRY_SENSOR_DEPTH = 4.1;
const INDOOR_DOOR_SENSOR_R = 2.75;
const INDOOR_DOOR_SWING = Math.PI * 0.48;

interface GlassMaterialSpec {
  color: string;
  opacity: number;
  roughness: number;
  envMapIntensity: number;
  frameColor: string;
}

function getInteriorLightMix(world?: WorldSceneState | null): number {
  if (!world) return 0.8;
  return THREE.MathUtils.clamp(
    Math.max(1 - world.daylight, world.buildingLightsOn ? 0.2 : 0) +
      (world.buildingLightsOn ? 0.08 : 0),
    0,
    1,
  );
}

function getWindowGlowMix(world?: WorldSceneState | null): number {
  if (!world) return 0.08;
  if (!world.buildingLightsOn) {
    return THREE.MathUtils.clamp(world.weather.rainStrength * 0.08, 0, 0.08);
  }
  return THREE.MathUtils.clamp(
    Math.max(0, 1 - world.daylight * 1.18) * 0.92 +
      world.weather.rainStrength * 0.18,
    0,
    1,
  );
}

function getExteriorAccentMix(world?: WorldSceneState | null): number {
  if (!world) return 0.45;
  return THREE.MathUtils.clamp(
    (world.streetLightsOn ? 0.35 : 0) +
      Math.max(0, 1 - world.daylight * 1.12) * 0.7 +
      world.weather.rainStrength * 0.18,
    0,
    1,
  );
}

function makePonyPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-118, 28);
  ctx.lineTo(-78, -8);
  ctx.lineTo(-24, -20);
  ctx.lineTo(4, -58);
  ctx.lineTo(56, -78);
  ctx.lineTo(116, -58);
  ctx.lineTo(108, -18);
  ctx.lineTo(72, -6);
  ctx.lineTo(92, 18);
  ctx.lineTo(132, 10);
  ctx.lineTo(150, 36);
  ctx.lineTo(104, 44);
  ctx.lineTo(76, 34);
  ctx.lineTo(52, 60);
  ctx.lineTo(18, 54);
  ctx.lineTo(-6, 92);
  ctx.lineTo(-34, 92);
  ctx.lineTo(-22, 40);
  ctx.lineTo(-62, 36);
  ctx.lineTo(-90, 92);
  ctx.lineTo(-120, 92);
  ctx.lineTo(-106, 28);
  ctx.closePath();
  ctx.restore();
}

function addRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const clampedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, clampedRadius);
    return;
  }
  if (clampedRadius === 0) {
    ctx.rect(x, y, width, height);
    return;
  }
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - clampedRadius,
    y + height,
  );
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
}

function makeCarpetTileTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#d8d6ce";
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle =
        y % 16 === 0 ? "rgba(246,241,231,0.11)" : "rgba(76,78,80,0.035)";
      ctx.fillRect(0, y, size, 1);
    }

    const tile = size / 2;
    ctx.strokeStyle = "rgba(72,78,86,0.16)";
    ctx.lineWidth = 3;
    for (let x = 0; x <= size; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(247,240,228,0.06)";
    ctx.fillRect(0, 0, tile, tile);
    ctx.fillRect(tile, tile, tile, tile);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeWallTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#dedbd2";
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 128) {
      ctx.fillStyle = "rgba(98,105,112,0.075)";
      ctx.fillRect(x, 0, 2, size);
    }
    ctx.fillStyle = "rgba(246,241,230,0.17)";
    ctx.fillRect(0, 0, size, 160);
    ctx.fillStyle = "rgba(98,105,112,0.06)";
    ctx.fillRect(0, 370, size, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 2);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function makeFacadeWallTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, "#a6adb3");
    bg.addColorStop(0.55, "#939da5");
    bg.addColorStop(1, "#7d8994");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    for (let x = 32; x < size; x += 96) {
      ctx.fillStyle = "rgba(51, 65, 85, 0.16)";
      ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = "rgba(220,224,226,0.13)";
      ctx.fillRect(x + 3, 0, 1, size);
    }

    for (let y = 28; y < size; y += 76) {
      ctx.fillStyle = "rgba(220,224,226,0.07)";
      ctx.fillRect(0, y, size, 1);
    }

    ctx.fillStyle = "rgba(222,224,222,0.12)";
    ctx.fillRect(0, 0, size, 150);
    ctx.fillStyle = "rgba(30,41,59,0.10)";
    ctx.fillRect(0, size - 94, size, 42);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 2);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const FACADE_MATERIAL = {
  wallColor: "#8f9aa4",
  sideWallColor: "#828e99",
  trimColor: "#5a6671",
  sillColor: "#4b5563",
} as const;

function makeFacadeBrandTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 320;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#f8fafc");
    bg.addColorStop(1, "#e6ecf4");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(37, 99, 235, 0.10)";
    ctx.fillRect(0, 0, width, 34);
    ctx.fillStyle = "rgba(15, 23, 42, 0.06)";
    ctx.fillRect(0, height - 34, width, 34);

    ctx.save();
    ctx.translate(188, 164);
    ctx.beginPath();
    ctx.arc(0, 0, 106, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#2563eb";
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#ff7a45";
    makePonyPath(ctx, 188, 172, 0.72);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font =
      '800 96px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText("小马跳动", 334, 154);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.22)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(336, 214);
    ctx.lineTo(860, 214);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makePonyBadgeTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 188, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(size / 2, size / 2 + 8);
    ctx.scale(1.06, 1.06);
    ctx.fillStyle = "#ffffff";
    makePonyPath(ctx, 0, 0, 1);
    ctx.fill();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeStandardsTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f7f8fa";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#c62828";
    ctx.font =
      '800 56px "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("优秀员工的10大标准", width / 2, 82);

    const items = [
      ["品德", "真诚靠谱"],
      ["负责", "件件闭环"],
      ["学习", "持续进步"],
      ["协作", "支持同伴"],
      ["目标", "结果导向"],
      ["态度", "积极主动"],
      ["勤奋", "行动迅速"],
      ["执行", "落实到位"],
      ["清晰", "及时反馈"],
      ["专注", "深度投入"],
    ];
    const cols = 5;
    const cardW = 154;
    const cardH = 128;
    const gapX = 28;
    const gapY = 28;
    const startX = (width - cols * cardW - (cols - 1) * gapX) / 2;
    const startY = 154;
    items.forEach(([label, sub], index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const red = index % 2 === 0;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = red ? "#c62828" : "#1e5b97";
      ctx.lineWidth = 6;
      addRoundedRectPath(ctx, x, y, cardW, cardH, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = red ? "#c62828" : "#1e5b97";
      ctx.font =
        '800 50px "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif';
      ctx.fillText(label, x + cardW / 2, y + 52);
      ctx.fillStyle = "#3d4650";
      ctx.font =
        '500 22px "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif';
      ctx.fillText(sub, x + cardW / 2, y + 94);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeQuoteTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 384;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f7f8fa";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(30,91,151,0.08)";
    ctx.fillRect(0, 0, width, 26);
    ctx.fillRect(0, height - 26, width, 26);

    ctx.fillStyle = "#111827";
    ctx.font =
      '800 88px "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("无奋斗", width / 2 - 148, 138);
    ctx.fillStyle = "#d32f2f";
    ctx.fillText("不青春", width / 2 + 188, 138);

    ctx.fillStyle = "#1f2937";
    ctx.font =
      '700 44px "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif';
    ctx.fillText("从青春起步，向梦想迈进", width / 2, 232);
    ctx.fillStyle = "#374151";
    ctx.font = '700 32px "Georgia", serif';
    ctx.fillText("Let youth glitter in struggling.", width / 2, 292);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeRoomSignTexture(label: string): THREE.CanvasTexture {
  const width = 1024;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#f6c343";
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, width - 28, height - 28);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font =
      '700 92px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(label, width / 2, height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeTaskBoardScreenTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#07111f");
    gradient.addColorStop(1, "#102c46");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(148, 163, 184, 0.18)";
    ctx.fillRect(36, 88, width - 72, height - 126);
    ctx.strokeStyle = "#f6c343";
    ctx.lineWidth = 6;
    ctx.strokeRect(36, 88, width - 72, height - 126);

    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font =
      '700 46px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    ctx.fillText("任务白板", 56, 48);

    const columns = [
      { title: "待办", color: "#38bdf8" },
      { title: "进行中", color: "#f6c343" },
      { title: "已完成", color: "#22c55e" },
    ] as const;
    columns.forEach((column, index) => {
      const colX = 64 + index * 304;
      ctx.fillStyle = column.color;
      ctx.fillRect(colX, 116, 232, 18);
      ctx.fillStyle = "#e2e8f0";
      ctx.font =
        '700 34px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
      ctx.fillText(column.title, colX, 154);
      [186, 258, 330].forEach((cardY, cardIndex) => {
        ctx.fillStyle = "rgba(226, 232, 240, 0.16)";
        ctx.fillRect(colX, cardY, 232 - cardIndex * 20, 46);
      });
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function CultureWallSigns(): React.JSX.Element {
  return <SideCultureSigns />;
}

function WallTrim(): React.JSX.Element {
  const halfW = WORLD_W / 2;
  const halfH = WORLD_H / 2;
  const wallT = ROOM_WALL_T;
  const southTrimGap = SOUTH_ENTRY_DOOR_W + 0.7;
  const southTrimSegmentW = Math.max((WORLD_W - southTrimGap) / 2, 0);
  const southTrimLeftX = -southTrimGap / 2 - southTrimSegmentW / 2;
  const southTrimRightX = southTrimGap / 2 + southTrimSegmentW / 2;
  const southTrimZ = halfH - wallT / 2 - BASEBOARD_T / 2;
  const baseColor = "#87909b";
  const railColor = "#c8ced6";
  return (
    <group>
      <mesh
        position={[0, BASEBOARD_H / 2, -halfH + wallT / 2 + BASEBOARD_T / 2]}
      >
        <boxGeometry args={[WORLD_W, BASEBOARD_H, BASEBOARD_T]} />
        <meshStandardMaterial color={baseColor} roughness={0.72} />
      </mesh>
      <mesh position={[0, CHAIR_RAIL_H, -halfH + wallT / 2 + BASEBOARD_T / 2]}>
        <boxGeometry args={[WORLD_W, 0.045, BASEBOARD_T]} />
        <meshStandardMaterial color={railColor} roughness={0.68} />
      </mesh>
      {[
        ["left", southTrimLeftX],
        ["right", southTrimRightX],
      ].map(([id, x]) => (
        <group key={`south-trim-${id}`}>
          <mesh position={[x as number, BASEBOARD_H / 2, southTrimZ]}>
            <boxGeometry args={[southTrimSegmentW, BASEBOARD_H, BASEBOARD_T]} />
            <meshStandardMaterial color={baseColor} roughness={0.72} />
          </mesh>
          <mesh position={[x as number, CHAIR_RAIL_H, southTrimZ]}>
            <boxGeometry args={[southTrimSegmentW, 0.045, BASEBOARD_T]} />
            <meshStandardMaterial color={railColor} roughness={0.68} />
          </mesh>
        </group>
      ))}
      <mesh
        position={[-halfW + wallT / 2 + BASEBOARD_T / 2, BASEBOARD_H / 2, 0]}
      >
        <boxGeometry args={[BASEBOARD_T, BASEBOARD_H, WORLD_H]} />
        <meshStandardMaterial color={baseColor} roughness={0.72} />
      </mesh>
      <mesh position={[-halfW + wallT / 2 + BASEBOARD_T / 2, CHAIR_RAIL_H, 0]}>
        <boxGeometry args={[BASEBOARD_T, 0.045, WORLD_H]} />
        <meshStandardMaterial color={railColor} roughness={0.68} />
      </mesh>
      <mesh
        position={[halfW - wallT / 2 - BASEBOARD_T / 2, BASEBOARD_H / 2, 0]}
      >
        <boxGeometry args={[BASEBOARD_T, BASEBOARD_H, WORLD_H]} />
        <meshStandardMaterial color={baseColor} roughness={0.72} />
      </mesh>
      <mesh position={[halfW - wallT / 2 - BASEBOARD_T / 2, CHAIR_RAIL_H, 0]}>
        <boxGeometry args={[BASEBOARD_T, 0.045, WORLD_H]} />
        <meshStandardMaterial color={railColor} roughness={0.68} />
      </mesh>
    </group>
  );
}

function OfficeGlassPanels(): React.JSX.Element {
  const halfW = WORLD_W / 2;
  const halfH = WORLD_H / 2;
  const wallT = ROOM_WALL_T;
  const y = 1.78;
  const glassH = 1.05;
  const material = (
    <meshStandardMaterial
      color="#b9d4e6"
      roughness={0.04}
      metalness={0.18}
      transparent
      opacity={0.26}
      depthWrite={false}
      envMapIntensity={1.45}
      side={THREE.DoubleSide}
    />
  );
  return (
    <group>
      {[-5.8, 5.8].map((x) => (
        <mesh key={`south-${x}`} position={[x, y, halfH - wallT / 2 - 0.012]}>
          <planeGeometry args={[4.4, glassH]} />
          {material}
        </mesh>
      ))}
      {[-5.6, 5.6].map((z) => (
        <mesh
          key={`east-${z}`}
          position={[halfW - wallT / 2 - 0.012, y, z]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[4.2, glassH]} />
          {material}
        </mesh>
      ))}
      {[-5.6, 5.6].map((z) => (
        <mesh
          key={`west-${z}`}
          position={[-halfW + wallT / 2 + 0.012, y, z]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[4.2, glassH]} />
          {material}
        </mesh>
      ))}
    </group>
  );
}

function CeilingAndLights({
  world,
}: {
  world?: WorldSceneState | null;
}): React.JSX.Element {
  const recessedDownlights: Array<[number, number]> = [
    [-10.2, -10.0],
    [-5.0, -10.0],
    [0.4, -10.0],
    [5.8, -10.0],
    [10.4, -8.0],
    [-10.4, -4.8],
    [-4.8, -4.8],
    [0.6, -4.6],
    [6.0, -4.4],
    [10.4, -2.0],
    [-10.2, 1.4],
    [-4.8, 1.6],
    [0.6, 1.8],
    [6.0, 2.0],
    [10.2, 4.6],
    [-10.2, 7.8],
    [-4.8, 8.4],
    [0.6, 8.6],
    [6.0, 8.8],
    [10.2, 8.2],
  ];
  const perimeterDownlights: Array<[number, number]> = [
    [-WORLD_W / 2 + 2.6, 0],
    [WORLD_W / 2 - 2.6, 0],
    [0, -WORLD_H / 2 + 2.6],
    [0, WORLD_H / 2 - 2.6],
  ];
  const coveLightRuns: Array<{
    key: string;
    x: number;
    z: number;
    w: number;
    d: number;
  }> = [
    { key: "north", x: 0, z: -WORLD_H / 2 + 0.46, w: WORLD_W - 1.2, d: 0.08 },
    { key: "south", x: 0, z: WORLD_H / 2 - 0.46, w: WORLD_W - 1.2, d: 0.08 },
    { key: "west", x: -WORLD_W / 2 + 0.46, z: 0, w: 0.08, d: WORLD_H - 1.2 },
    { key: "east", x: WORLD_W / 2 - 0.46, z: 0, w: 0.08, d: WORLD_H - 1.2 },
  ];
  const softFillNodes: Array<[number, number]> = [
    [-7.8, -7.2],
    [0, -6.5],
    [7.6, -6.4],
    [-6.8, 3.2],
    [6.8, 3.5],
    [0, 8.2],
  ];
  const interiorMix = getInteriorLightMix(world);
  const interiorBoost = world
    ? THREE.MathUtils.lerp(
        1.05,
        1.34,
        Math.max(1 - world.daylight, world.buildingLightsOn ? 0.22 : 0),
      )
    : 1.18;
  const ceilingGlowIntensity =
    THREE.MathUtils.lerp(0.08, 0.24, interiorMix) *
    Math.min(interiorBoost, 1.34);
  const ceilingFillIntensity =
    THREE.MathUtils.lerp(0.12, 0.38, interiorMix) *
    Math.min(interiorBoost, 1.34);
  const coveEmissiveIntensity =
    THREE.MathUtils.lerp(0.7, 1.65, interiorMix) *
    Math.min(interiorBoost, 1.22);
  const recessedEmissiveIntensity =
    THREE.MathUtils.lerp(0.8, 2.2, interiorMix) * Math.min(interiorBoost, 1.24);
  const recessedPointIntensity =
    THREE.MathUtils.lerp(0.035, 0.105, interiorMix) *
    Math.min(interiorBoost, 1.18);
  const recessedPointDistance = THREE.MathUtils.lerp(5.2, 7.6, interiorMix);
  const downlightEmissiveIntensity =
    THREE.MathUtils.lerp(0.5, 1.25, interiorMix) * Math.min(interiorBoost, 1.2);
  const downlightPointIntensity =
    THREE.MathUtils.lerp(0.025, 0.075, interiorMix) *
    Math.min(interiorBoost, 1.12);
  const downlightPointDistance = THREE.MathUtils.lerp(5.8, 8.0, interiorMix);
  const softFillIntensity =
    THREE.MathUtils.lerp(0.08, 0.22, interiorMix) *
    Math.min(interiorBoost, 1.28);
  const softFillDistance = THREE.MathUtils.lerp(9.6, 13.5, interiorMix);
  return (
    <group>
      <hemisphereLight
        position={[0, ROOM_WALL_H, 0]}
        color="#f7f7f2"
        groundColor="#b6bfc9"
        intensity={ceilingFillIntensity}
      />
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ROOM_WALL_H, 0]}
        receiveShadow
      >
        <planeGeometry args={[WORLD_W, WORLD_H]} />
        <meshStandardMaterial
          color="#d7d6d0"
          emissive="#dedbd2"
          emissiveIntensity={ceilingGlowIntensity}
          roughness={0.86}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {softFillNodes.map(([x, z]) => (
        <pointLight
          key={`soft-fill-${x}-${z}`}
          position={[x, ROOM_WALL_H - 0.75, z]}
          color="#fff8ef"
          intensity={softFillIntensity}
          distance={softFillDistance}
          decay={1.55}
        />
      ))}
      {Array.from({ length: 7 }).map((_, index) => {
        const x = -WORLD_W / 2 + (WORLD_W / 6) * index;
        return (
          <mesh
            key={`ceiling-x-${index}`}
            position={[x, ROOM_WALL_H - 0.012, 0]}
          >
            <boxGeometry args={[0.018, 0.018, WORLD_H]} />
            <meshStandardMaterial color="#cfd1ce" roughness={0.72} />
          </mesh>
        );
      })}
      {Array.from({ length: 7 }).map((_, index) => {
        const z = -WORLD_H / 2 + (WORLD_H / 6) * index;
        return (
          <mesh
            key={`ceiling-z-${index}`}
            position={[0, ROOM_WALL_H - 0.012, z]}
          >
            <boxGeometry args={[WORLD_W, 0.018, 0.018]} />
            <meshStandardMaterial color="#cfd1ce" roughness={0.72} />
          </mesh>
        );
      })}
      {coveLightRuns.map((run) => (
        <mesh
          key={`ceiling-cove-${run.key}`}
          position={[run.x, ROOM_WALL_H - 0.038, run.z]}
        >
          <boxGeometry args={[run.w, 0.018, run.d]} />
          <meshStandardMaterial
            color="#fff9ee"
            emissive="#fff2d9"
            emissiveIntensity={coveEmissiveIntensity}
            toneMapped={false}
            roughness={0.2}
            metalness={0.02}
          />
        </mesh>
      ))}
      {recessedDownlights.map(([x, z]) => (
        <group
          key={`recessed-downlight-${x}-${z}`}
          position={[x, ROOM_WALL_H - 0.034, z]}
        >
          <mesh>
            <cylinderGeometry args={[0.162, 0.178, 0.026, 30]} />
            <meshStandardMaterial
              color="#cfd6de"
              roughness={0.36}
              metalness={0.32}
            />
          </mesh>
          <mesh position={[0, -0.014, 0]}>
            <cylinderGeometry args={[0.102, 0.112, 0.014, 30]} />
            <meshStandardMaterial
              color="#fffaf1"
              emissive="#fff1dc"
              emissiveIntensity={recessedEmissiveIntensity}
              toneMapped={false}
              roughness={0.18}
              metalness={0.02}
            />
          </mesh>
          <pointLight
            position={[0, -0.36, 0]}
            color="#fff7ee"
            intensity={recessedPointIntensity}
            distance={recessedPointDistance}
            decay={2}
          />
        </group>
      ))}
      {perimeterDownlights.map(([x, z]) => (
        <group
          key={`perimeter-downlight-${x}-${z}`}
          position={[x, ROOM_WALL_H - 0.03, z]}
        >
          <mesh castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.026, 24]} />
            <meshStandardMaterial
              color="#d8dee5"
              roughness={0.42}
              metalness={0.22}
            />
          </mesh>
          <mesh position={[0, -0.012, 0]}>
            <cylinderGeometry args={[0.112, 0.122, 0.018, 24]} />
            <meshStandardMaterial
              color="#fffdf7"
              emissive="#fff8ee"
              emissiveIntensity={downlightEmissiveIntensity}
              toneMapped={false}
              roughness={0.12}
              metalness={0.02}
            />
          </mesh>
          <pointLight
            position={[0, -0.4, 0]}
            color="#fff7ee"
            intensity={downlightPointIntensity}
            distance={downlightPointDistance}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
}

/** North wall 鈥?3.6 m tall with three window openings and glass panels. */
function NorthWall({
  palette,
  world,
}: {
  palette: WorldPalette;
  world?: WorldSceneState | null;
}): React.JSX.Element {
  void palette;
  const halfW = WORLD_W / 2;
  const z = -WORLD_H / 2;
  const wallT = 0.2;
  const wallH = ROOM_WALL_H;
  const windowW = 5.0;
  const windowH = 1.4;
  const windowY = 2.2;
  const numWindows = 3;

  const gap = (WORLD_W - numWindows * windowW) / (numWindows + 1);
  const winBottom = windowY - windowH / 2;
  const winTop = windowY + windowH / 2;
  const wallTexture = useMemo(makeFacadeWallTexture, []);
  const windowGlow = getWindowGlowMix(world);
  const windowColor = useMemo(
    () =>
      new THREE.Color("#c8dae8").lerp(
        new THREE.Color("#f8e2bb"),
        windowGlow * 0.32,
      ),
    [windowGlow],
  );
  const windowEmissiveIntensity =
    windowGlow * (world?.interiorLightBoost ?? 1.12) * 0.92;
  const windowOpacity = THREE.MathUtils.lerp(0.34, 0.5, windowGlow);
  const windowRoughness = THREE.MathUtils.lerp(0.05, 0.13, windowGlow);
  const windowMetalness = THREE.MathUtils.lerp(0.4, 0.18, windowGlow);
  const windowEnvMapIntensity = THREE.MathUtils.lerp(1.0, 0.44, windowGlow);

  return (
    <group>
      {/* Bottom solid strip */}
      <mesh position={[0, winBottom / 2, z]}>
        <boxGeometry args={[WORLD_W, winBottom, wallT]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.wallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      {/* Top solid strip */}
      <mesh position={[0, winTop + (wallH - winTop) / 2, z]}>
        <boxGeometry args={[WORLD_W, wallH - winTop, wallT]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.wallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      {/* Vertical pillars between windows */}
      {Array.from({ length: numWindows + 1 }).map((_, i) => {
        const x = -halfW + gap * (i + 0.5) + windowW * i;
        return (
          <mesh key={`p-${i}`} position={[x, windowY, z]}>
            <boxGeometry args={[gap, windowH, wallT]} />
            <meshStandardMaterial
              map={wallTexture}
              color={FACADE_MATERIAL.wallColor}
              roughness={0.84}
              metalness={0.04}
              envMapIntensity={0.28}
            />
          </mesh>
        );
      })}
      {/* Window glass */}
      {Array.from({ length: numWindows }).map((_, i) => {
        const x = -halfW + gap * (i + 1) + windowW * (i + 0.5);
        return (
          <mesh key={`g-${i}`} position={[x, windowY, z + wallT / 2 + 0.02]}>
            <planeGeometry args={[windowW - 0.2, windowH - 0.2]} />
            <meshStandardMaterial
              color={windowColor}
              roughness={windowRoughness}
              metalness={windowMetalness}
              transparent
              opacity={windowOpacity}
              envMapIntensity={windowEnvMapIntensity}
              emissive="#ffe6bc"
              emissiveIntensity={windowEmissiveIntensity}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function RoofHelipad({
  world,
}: {
  world?: WorldSceneState | null;
}): React.JSX.Element {
  const roofY = ROOM_WALL_H + 0.06;
  const accentMix = getExteriorAccentMix(world);
  const helipadLightIntensity = THREE.MathUtils.lerp(0.18, 0.72, accentMix);
  const helipadMarkingMaterial = {
    color: "#dbe2ea",
    roughness: 0.56,
    metalness: 0.08,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  } as const;
  return (
    <group position={[0, roofY, 0]}>
      <mesh position={[0, ROOF_SLAB_Y, 0]} receiveShadow>
        <boxGeometry args={[WORLD_W + 0.08, ROOF_SLAB_H, WORLD_H + 0.08]} />
        <meshStandardMaterial
          color="#8e98a3"
          roughness={0.9}
          metalness={0.04}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, HELIPAD_MARKING_LIFT, 0]}
        receiveShadow
      >
        <ringGeometry args={[1.6, 2.58, 48]} />
        <meshStandardMaterial {...helipadMarkingMaterial} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, HELIPAD_MARKING_LIFT + 0.001, 0]}
        receiveShadow
      >
        <planeGeometry args={[0.44, 2.1]} />
        <meshStandardMaterial {...helipadMarkingMaterial} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, HELIPAD_MARKING_LIFT + 0.001, 0]}
        receiveShadow
      >
        <planeGeometry args={[2.1, 0.44]} />
        <meshStandardMaterial {...helipadMarkingMaterial} />
      </mesh>
      <mesh position={[0, -0.012, 0]} receiveShadow>
        <cylinderGeometry args={[2.86, 2.86, 0.03, 48]} />
        <meshStandardMaterial
          color="#5b6570"
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`helipad-light-${side}`}
          position={[side * 2.18, 0.08, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.06, 0.06, 0.16, 16]} />
          <meshStandardMaterial
            color="#94a3b8"
            emissive="#7dd3fc"
            emissiveIntensity={helipadLightIntensity}
            roughness={0.34}
            metalness={0.24}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Floor, rug and perimeter walls 鈥?a clean, minimal office shell. */
function SouthEntranceDoor({
  world,
  liveAgentsRef,
}: {
  world?: WorldSceneState | null;
  liveAgentsRef?: React.RefObject<RenderAgent[]>;
}): React.JSX.Element {
  const leftPanelRef = useRef<THREE.Group>(null);
  const rightPanelRef = useRef<THREE.Group>(null);
  const sensorRef = useRef<THREE.Mesh>(null);
  const opennessRef = useRef(0);
  const halfH = WORLD_H / 2;
  const frameZ = halfH + 0.01;
  const panelW = SOUTH_ENTRY_DOOR_W / 2 - SOUTH_ENTRY_DOOR_PANEL_GAP;
  const panelH = SOUTH_ENTRY_DOOR_H - 0.22;
  const panelBaseX = SOUTH_ENTRY_DOOR_W / 4;
  const handleOffsetX = panelBaseX - 0.56;
  const handleOffsetY = 1.18 - panelH / 2;
  const accentMix = getExteriorAccentMix(world);
  const canopyLightIntensity = THREE.MathUtils.lerp(0.42, 1.12, accentMix);
  const sensorBaseIntensity = THREE.MathUtils.lerp(0.45, 1.05, accentMix);

  useFrame(({ camera }, delta) => {
    const playerPosition = camera.userData.aimashiPlayerPosition as
      | { x: number; y: number; z: number }
      | undefined;
    const sensorX = playerPosition?.x ?? camera.position.x;
    const sensorZ = playerPosition?.z ?? camera.position.z;
    const nearDoor =
      Math.abs(sensorX) < SOUTH_ENTRY_SENSOR_HALF_W &&
      Math.abs(sensorZ - halfH) < SOUTH_ENTRY_SENSOR_DEPTH;
    const agentNear = liveAgentsRef?.current?.some((agent) => {
      const ax = agent.x * SCALE - WORLD_W / 2;
      const az = agent.y * SCALE - WORLD_H / 2;
      return (
        Math.abs(ax) < SOUTH_ENTRY_SENSOR_HALF_W &&
        Math.abs(az - halfH) < SOUTH_ENTRY_SENSOR_DEPTH
      );
    });
    const target = nearDoor || agentNear ? 1 : 0;
    opennessRef.current = THREE.MathUtils.damp(
      opennessRef.current,
      target,
      12,
      delta,
    );
    const slide = opennessRef.current * SOUTH_ENTRY_DOOR_SLIDE;
    if (leftPanelRef.current) {
      leftPanelRef.current.position.x = -panelBaseX - slide;
    }
    if (rightPanelRef.current) {
      rightPanelRef.current.position.x = panelBaseX + slide;
    }
    if (sensorRef.current) {
      const material = sensorRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity =
        sensorBaseIntensity + opennessRef.current * 1.3;
    }
  });

  return (
    <group position={[0, 0, frameZ]}>
      <mesh position={[0, SOUTH_ENTRY_DOOR_H + 0.48, -0.18]} castShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 1.6, 0.2, 1.16]} />
        <meshStandardMaterial
          color="#243241"
          roughness={0.3}
          metalness={0.42}
        />
      </mesh>
      <mesh position={[0, SOUTH_ENTRY_DOOR_H + 0.39, 0.28]} receiveShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 1.46, 0.03, 0.26]} />
        <meshStandardMaterial
          color="#fff4cc"
          emissive="#fff4cc"
          emissiveIntensity={canopyLightIntensity}
          toneMapped={false}
          roughness={0.18}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`portal-fin-${side}`}
          position={[
            side * (SOUTH_ENTRY_DOOR_W / 2 + 0.56),
            SOUTH_ENTRY_DOOR_H / 2 + 0.06,
            -0.08,
          ]}
          castShadow
        >
          <boxGeometry args={[0.3, SOUTH_ENTRY_DOOR_H + 0.74, 0.26]} />
          <meshStandardMaterial
            color="#c6bba8"
            roughness={0.48}
            metalness={0.1}
          />
        </mesh>
      ))}
      <mesh position={[0, SOUTH_ENTRY_DOOR_H + 0.86, -0.21]} castShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 0.98, 0.28, 0.34]} />
        <meshStandardMaterial
          color="#d8d0c6"
          roughness={0.42}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[0, SOUTH_ENTRY_DOOR_H + 0.03, 0]} castShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 0.32, 0.08, 0.16]} />
        <meshStandardMaterial
          color="#1f2731"
          roughness={0.34}
          metalness={0.54}
        />
      </mesh>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 0.28, 0.06, 0.18]} />
        <meshStandardMaterial
          color="#202a35"
          roughness={0.36}
          metalness={0.48}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`jamb-${side}`}
          position={[
            side * (SOUTH_ENTRY_DOOR_W / 2 + 0.11),
            SOUTH_ENTRY_DOOR_H / 2,
            0,
          ]}
          castShadow
        >
          <boxGeometry args={[0.12, SOUTH_ENTRY_DOOR_H, 0.12]} />
          <meshStandardMaterial
            color="#202a35"
            roughness={0.36}
            metalness={0.52}
          />
        </mesh>
      ))}
      <group ref={leftPanelRef} position={[-panelBaseX, panelH / 2, 0]}>
        <mesh renderOrder={1}>
          <planeGeometry args={[panelW, panelH]} />
          <meshStandardMaterial
            color="#c8d7de"
            roughness={0.08}
            metalness={0.12}
            transparent
            opacity={0.22}
            envMapIntensity={1.24}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[handleOffsetX, handleOffsetY, 0.05]} castShadow>
          <boxGeometry args={[0.08, 0.72, 0.03]} />
          <meshStandardMaterial
            color="#111827"
            roughness={0.28}
            metalness={0.68}
          />
        </mesh>
      </group>
      <group ref={rightPanelRef} position={[panelBaseX, panelH / 2, 0]}>
        <mesh renderOrder={1}>
          <planeGeometry args={[panelW, panelH]} />
          <meshStandardMaterial
            color="#c8d7de"
            roughness={0.08}
            metalness={0.12}
            transparent
            opacity={0.22}
            envMapIntensity={1.24}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[-handleOffsetX, handleOffsetY, 0.05]} castShadow>
          <boxGeometry args={[0.08, 0.72, 0.03]} />
          <meshStandardMaterial
            color="#111827"
            roughness={0.28}
            metalness={0.68}
          />
        </mesh>
      </group>
      <mesh
        ref={sensorRef}
        position={[0, SOUTH_ENTRY_DOOR_H + 0.17, 0]}
        castShadow
      >
        <boxGeometry args={[0.82, 0.08, 0.1]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive="#60a5fa"
          emissiveIntensity={0.8}
          roughness={0.28}
          metalness={0.42}
        />
      </mesh>
      <mesh position={[0, 0.012, 0]} receiveShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 0.62, 0.024, 0.44]} />
        <meshStandardMaterial
          color="#d7dce3"
          roughness={0.62}
          metalness={0.06}
        />
      </mesh>
      <mesh position={[0, 0.025, 0.14]} receiveShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W + 0.34, 0.01, 0.04]} />
        <meshStandardMaterial
          color="#7b8794"
          roughness={0.38}
          metalness={0.44}
        />
      </mesh>
    </group>
  );
}

function SouthWall({
  palette,
  world,
  liveAgentsRef,
}: {
  palette: WorldPalette;
  world?: WorldSceneState | null;
  liveAgentsRef?: React.RefObject<RenderAgent[]>;
}): React.JSX.Element {
  void palette;
  const halfW = WORLD_W / 2;
  const halfH = WORLD_H / 2;
  const wallTexture = useMemo(makeFacadeWallTexture, []);
  const brandTexture = useMemo(makeFacadeBrandTexture, []);
  const badgeTexture = useMemo(makePonyBadgeTexture, []);
  const sideW = (WORLD_W - SOUTH_ENTRY_DOOR_W) / 2;
  const upperH = ROOM_WALL_H - SOUTH_ENTRY_DOOR_H;

  return (
    <group>
      <mesh position={[-halfW + sideW / 2, ROOM_WALL_H / 2, halfH]} castShadow>
        <boxGeometry args={[sideW, ROOM_WALL_H, ROOM_WALL_T]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.wallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      <mesh position={[halfW - sideW / 2, ROOM_WALL_H / 2, halfH]} castShadow>
        <boxGeometry args={[sideW, ROOM_WALL_H, ROOM_WALL_T]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.wallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      <mesh position={[0, SOUTH_ENTRY_DOOR_H + upperH / 2, halfH]} castShadow>
        <boxGeometry args={[SOUTH_ENTRY_DOOR_W, upperH, ROOM_WALL_T]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.wallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      <mesh position={[0, 2.98, halfH + ROOM_WALL_T / 2 + 0.02]} castShadow>
        <boxGeometry args={[7.18, 1.18, 0.18]} />
        <meshStandardMaterial
          color="#a8b1bb"
          roughness={0.42}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[0.34, 2.98, halfH + ROOM_WALL_T / 2 + 0.12]}>
        <planeGeometry args={[5.16, 0.92]} />
        <meshStandardMaterial
          map={brandTexture}
          roughness={0.32}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[-2.78, 2.98, halfH + ROOM_WALL_T / 2 + 0.12]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshStandardMaterial
          map={badgeTexture}
          roughness={0.24}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 3.7, halfH + ROOM_WALL_T / 2 + 0.01]} castShadow>
        <boxGeometry args={[8.46, 0.18, 0.22]} />
        <meshStandardMaterial
          color={FACADE_MATERIAL.trimColor}
          roughness={0.5}
          metalness={0.18}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`entry-upright-${side}`}
          position={[side * 3.58, 2.18, halfH + ROOM_WALL_T / 2 + 0.01]}
          castShadow
        >
          <boxGeometry args={[0.24, 2.9, 0.2]} />
          <meshStandardMaterial
            color="#8d98a4"
            roughness={0.46}
            metalness={0.12}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.012, halfH + SOUTH_ENTRY_PAD_D / 2]} receiveShadow>
        <boxGeometry args={[6.1, 0.024, SOUTH_ENTRY_PAD_D]} />
        <meshStandardMaterial
          color="#d9dde3"
          roughness={0.84}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.02, halfH + SOUTH_ENTRY_PAD_D - 0.1]} receiveShadow>
        <boxGeometry args={[6.1, 0.04, 0.14]} />
        <meshStandardMaterial
          color="#b7bec7"
          roughness={0.74}
          metalness={0.06}
        />
      </mesh>
      <mesh position={[0, 0.021, halfH + 0.56]} receiveShadow>
        <boxGeometry args={[3.54, 0.02, 0.72]} />
        <meshStandardMaterial
          color={FACADE_MATERIAL.sillColor}
          roughness={0.88}
          metalness={0.06}
        />
      </mesh>
      <mesh position={[0, 0.03, halfH + 0.56]} receiveShadow>
        <boxGeometry args={[3.1, 0.012, 0.32]} />
        <meshStandardMaterial
          color="#c2cad3"
          roughness={0.44}
          metalness={0.12}
        />
      </mesh>
      <SouthEntranceDoor world={world} liveAgentsRef={liveAgentsRef} />
    </group>
  );
}

function SideCultureSigns(): React.JSX.Element {
  const halfW = WORLD_W / 2;
  const wallT = ROOM_WALL_T;
  const standardsTexture = useMemo(makeStandardsTexture, []);
  const quoteTexture = useMemo(makeQuoteTexture, []);

  return (
    <group>
      <group
        position={[-halfW + wallT / 2 + 0.035, 2.36, -5.9]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <mesh castShadow>
          <boxGeometry args={[5.4, 2.7, 0.055]} />
          <meshStandardMaterial color="#e8ecef" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.031]}>
          <planeGeometry args={[5.18, 2.46]} />
          <meshStandardMaterial map={standardsTexture} roughness={0.65} />
        </mesh>
      </group>
      <group
        position={[halfW - wallT / 2 - 0.035, 2.42, -4.8]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <mesh castShadow>
          <boxGeometry args={[5.6, 2.14, 0.055]} />
          <meshStandardMaterial color="#e8ecef" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.031]}>
          <planeGeometry args={[5.36, 1.92]} />
          <meshStandardMaterial map={quoteTexture} roughness={0.65} />
        </mesh>
      </group>
    </group>
  );
}

export const Room = memo(function Room({
  palette,
  world,
  liveAgentsRef,
}: {
  palette: WorldPalette;
  world?: WorldSceneState | null;
  liveAgentsRef?: React.RefObject<RenderAgent[]>;
}): React.JSX.Element {
  const halfW = WORLD_W / 2;
  const wallH = ROOM_WALL_H;
  const wallT = ROOM_WALL_T;
  const floorTexture = useMemo(makeCarpetTileTexture, []);
  const wallTexture = useMemo(makeFacadeWallTexture, []);
  const interiorMix = getInteriorLightMix(world);
  const interiorBoost = world?.interiorLightBoost ?? 1.18;
  const floorColor = useMemo(() => {
    return new THREE.Color(palette.floor).lerp(
      new THREE.Color("#c0c8d2"),
      THREE.MathUtils.clamp(interiorMix * interiorBoost * 0.24, 0, 0.34),
    );
  }, [interiorBoost, interiorMix, palette.floor]);
  return (
    <group>
      {/* Floor 鈥?slightly glossy so the IBL adds a soft sheen + grounding. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[WORLD_W, WORLD_H]} />
        <meshStandardMaterial
          map={floorTexture}
          color={floorColor}
          roughness={THREE.MathUtils.lerp(0.92, 0.82, interiorMix)}
          metalness={0}
          envMapIntensity={THREE.MathUtils.lerp(0.35, 0.62, interiorMix)}
        />
      </mesh>
      {/* Center rug for a bit of warmth (matte). */}
      {/* North wall 鈥?taller with windows */}
      <NorthWall palette={palette} world={world} />
      <CeilingAndLights world={world} />
      {/* South / east / west walls */}
      <SouthWall
        palette={palette}
        world={world}
        liveAgentsRef={liveAgentsRef}
      />
      <mesh position={[-halfW, wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, WORLD_H]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.sideWallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      <mesh position={[halfW, wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, WORLD_H]} />
        <meshStandardMaterial
          map={wallTexture}
          color={FACADE_MATERIAL.sideWallColor}
          roughness={0.84}
          metalness={0.04}
          envMapIntensity={0.28}
        />
      </mesh>
      <RoofHelipad world={world} />
      <WallTrim />
      <OfficeGlassPanels />
      <CultureWallSigns />
    </group>
  );
});

/** Interior partition walls (e.g. the work-area / rest-room divider). */
export const InteriorWalls = memo(function InteriorWalls({
  palette,
}: {
  palette: WorldPalette;
}): React.JSX.Element {
  const wallH = ROOM_WALL_H;
  const wallTexture = useMemo(makeWallTexture, []);
  return (
    <group>
      {INTERIOR_WALLS.map((wall) => {
        const [cx, , cz] = toWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
        const w = wall.w * SCALE;
        const d = wall.h * SCALE;
        const horizontal = w >= d;
        return (
          <group key={wall.id}>
            <mesh position={[cx, wallH / 2, cz]} castShadow>
              <boxGeometry args={[w, wallH, d]} />
              <meshStandardMaterial
                map={wallTexture}
                color={palette.wallEW}
                roughness={0.9}
              />
            </mesh>
            <mesh
              position={[
                cx,
                BASEBOARD_H / 2,
                cz + (horizontal ? d / 2 + BASEBOARD_T / 2 : 0),
              ]}
            >
              <boxGeometry
                args={[
                  horizontal ? w : BASEBOARD_T,
                  BASEBOARD_H,
                  horizontal ? BASEBOARD_T : d,
                ]}
              />
              <meshStandardMaterial color="#87909b" roughness={0.72} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

function IndoorGlassDoor({
  door,
  glassH,
  spec,
  signTexture,
  liveAgentsRef,
}: {
  door: (typeof GLASS_DOOR_PANELS)[number];
  glassH: number;
  spec: GlassMaterialSpec;
  signTexture?: THREE.Texture;
  liveAgentsRef?: React.RefObject<RenderAgent[]>;
}): React.JSX.Element {
  const pivotRef = useRef<THREE.Group>(null);
  const opennessRef = useRef(0);
  const [cx, , cz] = toWorld(door.x + door.w / 2, door.y + door.h / 2);
  const w = door.w * SCALE;
  const d = door.h * SCALE;
  const horizontal = w >= d;
  const gapW = horizontal ? w : d;
  const leafW = gapW * 0.78;
  const leafT = Math.max(Math.min(horizontal ? d : w, 0.08), 0.055);
  const labelW = Math.min(
    leafW * 0.74,
    door.id.startsWith("manager") ? 2.65 : 2.1,
  );
  const hingeSide = door.id.startsWith("manager") ? -1 : 1;
  const swingSign = door.id.startsWith("manager") ? 1 : -1;
  const pivotPosition: [number, number, number] = horizontal
    ? [cx + (hingeSide * leafW) / 2, 0, cz]
    : [cx, 0, cz + (hingeSide * leafW) / 2];
  const leafOffset: [number, number, number] = horizontal
    ? [(-hingeSide * leafW) / 2, 0, 0]
    : [0, 0, (-hingeSide * leafW) / 2];
  const doorOpacity = door.id.startsWith("manager")
    ? Math.max(0.5, spec.opacity + 0.2)
    : Math.max(0.38, spec.opacity + 0.2);

  useFrame(({ camera }, delta) => {
    const playerPosition = camera.userData.aimashiPlayerPosition as
      | { x: number; y: number; z: number }
      | undefined;
    const sensorX = playerPosition?.x ?? camera.position.x;
    const sensorZ = playerPosition?.z ?? camera.position.z;
    const agentNear = liveAgentsRef?.current?.some((agent) => {
      const ax = agent.x * SCALE - WORLD_W / 2;
      const az = agent.y * SCALE - WORLD_H / 2;
      return Math.hypot(ax - cx, az - cz) < INDOOR_DOOR_SENSOR_R;
    });
    const near =
      agentNear ||
      Math.hypot(sensorX - cx, sensorZ - cz) < INDOOR_DOOR_SENSOR_R;
    opennessRef.current = THREE.MathUtils.damp(
      opennessRef.current,
      near ? 1 : 0,
      12,
      delta,
    );
    if (pivotRef.current) {
      pivotRef.current.rotation.y =
        swingSign * INDOOR_DOOR_SWING * opennessRef.current;
    }
  });

  return (
    <group>
      <group ref={pivotRef} position={pivotPosition}>
        <group position={leafOffset}>
          <mesh position={[0, glassH / 2, 0]}>
            <boxGeometry
              args={
                horizontal ? [leafW, glassH, leafT] : [leafT, glassH, leafW]
              }
            />
            <meshStandardMaterial
              color={spec.color}
              roughness={0.08}
              metalness={0.22}
              transparent
              opacity={doorOpacity}
              envMapIntensity={spec.envMapIntensity}
            />
          </mesh>
          <mesh position={[0, glassH + 0.03, 0]}>
            <boxGeometry
              args={horizontal ? [leafW, 0.06, leafT] : [leafT, 0.06, leafW]}
            />
            <meshStandardMaterial
              color={spec.frameColor}
              roughness={0.38}
              metalness={0.45}
            />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry
              args={horizontal ? [leafW, 0.08, leafT] : [leafT, 0.08, leafW]}
            />
            <meshStandardMaterial
              color={spec.frameColor}
              roughness={0.38}
              metalness={0.45}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={`door-side-rail-${side}`}
              position={
                horizontal
                  ? [(side * leafW) / 2, glassH / 2, 0]
                  : [0, glassH / 2, (side * leafW) / 2]
              }
            >
              <boxGeometry
                args={
                  horizontal
                    ? [0.055, glassH, leafT * 1.2]
                    : [leafT * 1.2, glassH, 0.055]
                }
              />
              <meshStandardMaterial
                color={spec.frameColor}
                roughness={0.36}
                metalness={0.48}
              />
            </mesh>
          ))}
          {signTexture && (
            <>
              <mesh
                position={horizontal ? [0, 2.28, 0.046] : [0.046, 2.28, 0]}
                rotation={horizontal ? [0, 0, 0] : [0, Math.PI / 2, 0]}
              >
                <planeGeometry args={[labelW, 0.36]} />
                <meshStandardMaterial
                  map={signTexture}
                  roughness={0.42}
                  metalness={0.04}
                />
              </mesh>
              <mesh
                position={horizontal ? [0, 2.28, -0.046] : [-0.046, 2.28, 0]}
                rotation={horizontal ? [0, Math.PI, 0] : [0, -Math.PI / 2, 0]}
              >
                <planeGeometry args={[labelW, 0.36]} />
                <meshStandardMaterial
                  map={signTexture}
                  roughness={0.42}
                  metalness={0.04}
                />
              </mesh>
            </>
          )}
          <mesh
            position={
              horizontal
                ? [-hingeSide * leafW * 0.22, 1.14, 0.075]
                : [0.075, 1.14, -hingeSide * leafW * 0.22]
            }
          >
            <boxGeometry
              args={horizontal ? [0.48, 0.055, 0.04] : [0.04, 0.055, 0.48]}
            />
            <meshStandardMaterial
              color="#111827"
              roughness={0.28}
              metalness={0.65}
            />
          </mesh>
          <mesh
            position={
              horizontal
                ? [-hingeSide * leafW * 0.22, 1.14, -0.075]
                : [-0.075, 1.14, -hingeSide * leafW * 0.22]
            }
          >
            <boxGeometry
              args={horizontal ? [0.48, 0.055, 0.04] : [0.04, 0.055, 0.48]}
            />
            <meshStandardMaterial
              color="#111827"
              roughness={0.28}
              metalness={0.65}
            />
          </mesh>
        </group>
      </group>
      <mesh position={[cx, glassH + 0.07, cz]}>
        <boxGeometry
          args={
            horizontal
              ? [gapW + 0.22, 0.08, leafT * 1.45]
              : [leafT * 1.45, 0.08, gapW + 0.22]
          }
        />
        <meshStandardMaterial
          color={spec.frameColor}
          roughness={0.36}
          metalness={0.45}
        />
      </mesh>
      <mesh position={[cx, 0.08, cz]}>
        <boxGeometry
          args={
            horizontal
              ? [gapW + 0.12, 0.08, leafT * 1.4]
              : [leafT * 1.4, 0.08, gapW + 0.12]
          }
        />
        <meshStandardMaterial
          color={spec.frameColor}
          roughness={0.42}
          metalness={0.4}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`door-jamb-${door.id}-${side}`}
          position={
            horizontal
              ? [cx + (side * gapW) / 2, glassH / 2, cz]
              : [cx, glassH / 2, cz + (side * gapW) / 2]
          }
        >
          <boxGeometry
            args={
              horizontal
                ? [0.075, glassH, leafT * 1.7]
                : [leafT * 1.7, glassH, 0.075]
            }
          />
          <meshStandardMaterial
            color={spec.frameColor}
            roughness={0.36}
            metalness={0.5}
          />
        </mesh>
      ))}
      <mesh position={[pivotPosition[0], glassH / 2, pivotPosition[2]]}>
        <boxGeometry
          args={
            horizontal
              ? [0.12, glassH + 0.08, leafT * 2]
              : [leafT * 2, glassH + 0.08, 0.12]
          }
        />
        <meshStandardMaterial
          color="#101820"
          roughness={0.32}
          metalness={0.56}
        />
      </mesh>
    </group>
  );
}

/**
 * Clear glass partitions enclosing the CEO's corner office, with a slim metal
 * cap rail so the pane edges read from above. No shadows 鈥?clear glass casting
 * a solid shadow looks wrong.
 */
export const GlassWalls = memo(function GlassWalls({
  liveAgentsRef,
}: {
  liveAgentsRef?: React.RefObject<RenderAgent[]>;
}): React.JSX.Element {
  const glassH = ROOM_WALL_H - 0.08;

  const glassSpec = (id: string): GlassMaterialSpec => {
    if (id.startsWith("ceo-") || id.startsWith("manager-")) {
      return {
        color: "#b8c6d3",
        opacity: 0.42,
        roughness: 0.22,
        envMapIntensity: 0.86,
        frameColor: "#1f2731",
      };
    }
    return {
      color: "#d9ebf7",
      opacity: id.startsWith("lounge-") ? 0.14 : 0.18,
      roughness: 0.05,
      envMapIntensity: 1.2,
      frameColor: "#202a35",
    };
  };

  const doorSignTextures = useMemo(
    () =>
      new Map(
        GLASS_DOOR_PANELS.map((door) => [
          door.id,
          makeRoomSignTexture(door.label),
        ]),
      ),
    [],
  );

  return (
    <group>
      {GLASS_WALLS.map((wall) => {
        const [cx, , cz] = toWorld(wall.x + wall.w / 2, wall.y + wall.h / 2);
        const w = wall.w * SCALE;
        const d = wall.h * SCALE;
        const spec = glassSpec(wall.id);
        return (
          <group key={wall.id}>
            <mesh position={[cx, glassH / 2, cz]}>
              <boxGeometry args={[w, glassH, d]} />
              <meshStandardMaterial
                color={spec.color}
                roughness={spec.roughness}
                metalness={0.2}
                transparent
                opacity={spec.opacity}
                envMapIntensity={spec.envMapIntensity}
              />
            </mesh>
            <mesh position={[cx, glassH + 0.03, cz]}>
              <boxGeometry args={[w, 0.06, d]} />
              <meshStandardMaterial
                color={spec.frameColor}
                roughness={0.4}
                metalness={0.45}
              />
            </mesh>
            <mesh position={[cx, 0.08, cz]}>
              <boxGeometry args={[w, 0.08, d]} />
              <meshStandardMaterial
                color={spec.frameColor}
                roughness={0.38}
                metalness={0.45}
              />
            </mesh>
            <mesh position={[cx, glassH / 2, cz]}>
              <boxGeometry
                args={[w >= d ? 0.055 : w, glassH, w >= d ? d : 0.055]}
              />
              <meshStandardMaterial
                color={spec.frameColor}
                roughness={0.38}
                metalness={0.45}
              />
            </mesh>
          </group>
        );
      })}
      {GLASS_DOOR_PANELS.map((door) => {
        const spec = glassSpec(door.id);
        return (
          <IndoorGlassDoor
            key={door.id}
            door={door}
            glassH={glassH}
            spec={spec}
            signTexture={doorSignTextures.get(door.id)}
            liveAgentsRef={liveAgentsRef}
          />
        );
      })}
    </group>
  );
});

/**
 * Extra set dressing inside the CEO's glass office that isn't part of the
 * data-driven furniture pipeline: a wall-mounted task board, a dark executive
 * rug, and a tea table with a small service set for the reception corner.
 */
export const CeoOfficeExtras = memo(
  function CeoOfficeExtras(): React.JSX.Element {
    const { scene } = useGLTF(woodenTableGlbUrl, false, false);
    const taskBoardTexture = useMemo(makeTaskBoardScreenTexture, []);
    // Keep the table generous but not oversized so the lounge reads premium
    // instead of cramped.
    const tablePack = useMemo(() => {
      const table = normalizeFootprint(glbClone(scene, null), 1.34);
      table.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(table);
      return {
        table,
        topY: box.max.y,
      };
    }, [scene]);

    const [rugX, , rugZ] = toWorld(
      (CEO_OFFICE.minX + CEO_OFFICE.maxX) / 2,
      (CEO_OFFICE.minY + CEO_OFFICE.maxY) / 2,
    );
    const rugW = (CEO_OFFICE.maxX - CEO_OFFICE.minX - 90) * SCALE;
    const rugD = (CEO_OFFICE.maxY - CEO_OFFICE.minY - 110) * SCALE;
    const [tableX, , tableZ] = toWorld(CEO_TEA_TABLE_X, CEO_TEA_TABLE_Y);
    // Wall-mounted task board on the south perimeter wall, directly opposite
    // the manager seat so it reads like the office's command surface.
    const [tvX] = toWorld(CEO_DESK_X, 1450);
    const [, , tvZ] = toWorld(0, CEO_OFFICE.maxY - 10);

    return (
      <group>
        <group position={[tvX, 1.55, tvZ]} rotation={[0, Math.PI, 0]}>
          <mesh castShadow>
            <boxGeometry args={[2.8, 1.6, 0.08]} />
            <meshStandardMaterial
              color="#11151c"
              roughness={0.35}
              metalness={0.4}
            />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[2.58, 1.38]} />
            <meshStandardMaterial
              map={taskBoardTexture}
              emissive="#22425c"
              emissiveIntensity={0.32}
              roughness={0.12}
              metalness={0.08}
            />
          </mesh>
        </group>
        {/* Executive rug 鈥?above the main office rug (0.01) to avoid z-fights */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[rugX, 0.02, rugZ]}
          receiveShadow
        >
          <planeGeometry args={[rugW, rugD]} />
          <meshStandardMaterial
            color="#46536b"
            roughness={0.95}
            metalness={0}
            envMapIntensity={0.4}
          />
        </mesh>
        <group position={[tableX, 0.021, tableZ]}>
          <primitive object={tablePack.table} />
          <mesh
            position={[0.08, tablePack.topY + 0.016, -0.01]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.52, 0.03, 0.26]} />
            <meshStandardMaterial
              color="#2a231d"
              roughness={0.34}
              metalness={0.18}
            />
          </mesh>
          <mesh position={[-0.04, tablePack.topY + 0.062, 0]} castShadow>
            <sphereGeometry args={[0.06, 24, 18]} />
            <meshStandardMaterial
              color="#f2eee7"
              roughness={0.38}
              metalness={0.08}
            />
          </mesh>
          <mesh position={[-0.04, tablePack.topY + 0.118, 0]} castShadow>
            <cylinderGeometry args={[0.024, 0.03, 0.02, 18]} />
            <meshStandardMaterial
              color="#d4a64a"
              roughness={0.3}
              metalness={0.4}
            />
          </mesh>
          <mesh
            position={[0.04, tablePack.topY + 0.072, 0.025]}
            rotation={[0, 0, -0.95]}
            castShadow
          >
            <cylinderGeometry args={[0.009, 0.013, 0.1, 12]} />
            <meshStandardMaterial
              color="#f2eee7"
              roughness={0.38}
              metalness={0.08}
            />
          </mesh>
          <mesh
            position={[-0.11, tablePack.topY + 0.07, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <torusGeometry args={[0.03, 0.008, 10, 20]} />
            <meshStandardMaterial
              color="#f2eee7"
              roughness={0.38}
              metalness={0.08}
            />
          </mesh>
          {[
            [0.07, 0.02],
            [0.16, -0.04],
            [0.02, -0.075],
          ].map(([x, z]) => (
            <group key={`${x}-${z}`} position={[x, tablePack.topY + 0.032, z]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.036, 0.042, 0.05, 18]} />
                <meshStandardMaterial
                  color="#f7f4ee"
                  roughness={0.34}
                  metalness={0.06}
                />
              </mesh>
              <mesh position={[0, 0.018, 0]}>
                <cylinderGeometry args={[0.024, 0.024, 0.01, 16]} />
                <meshStandardMaterial color="#8a5a2b" roughness={0.9} />
              </mesh>
            </group>
          ))}
          <mesh position={[0.22, tablePack.topY + 0.05, 0.075]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.085, 20]} />
            <meshStandardMaterial
              color="#f2eee7"
              roughness={0.36}
              metalness={0.08}
            />
          </mesh>
          <mesh position={[0.22, tablePack.topY + 0.102, 0.075]} castShadow>
            <sphereGeometry args={[0.018, 16, 12]} />
            <meshStandardMaterial
              color="#d4a64a"
              roughness={0.28}
              metalness={0.42}
            />
          </mesh>
        </group>
      </group>
    );
  },
);

useGLTF.preload(woodenTableGlbUrl, false, false);
