import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { SCALE } from "../core/constants";
import { toWorld } from "../core/geometry";
import type { FurniturePlacement, FurnitureType, Workstation } from "../layout";
import type { OfficeAgent, OfficeAgentTask } from "../core/types";
import type { AgentBehaviorIntent } from "../core/agentBehavior";
import deskUrl from "../assets/desk.glb?url";
import executiveDeskUrl from "../assets/ceo_desk.glb?url";
import chairUrl from "../assets/chairDesk.glb?url";
import couchUrl from "../assets/loungeSofa.glb?url";
import sofaChairUrl from "../assets/sofa_chair.glb?url";
import beanbagUrl from "../assets/loungeDesignChair.glb?url";
import plantUrl from "../assets/pottedPlant.glb?url";
import whitePotUrl from "../assets/white_pot.glb?url";
import computerUrl from "../assets/computerScreen.glb?url";
import pantryUrl from "../assets/pantry.glb?url";

const SHOW_WORKSTATION_HELPER_HANDS = false;

interface FurnitureDef {
  url: string;
  scale: [number, number, number];
  tint: string | null;
  footprint: [number, number];
  castShadow: boolean;
  /** World-units lifted off the floor (e.g. a monitor resting on a desk). */
  yOffset?: number;
  origin?: "corner" | "center";
  /** Unscaled GLB-local X/Z point that should land on the placement coordinate. */
  placementAnchor?: [number, number];
}

// Per-type GLB + transform metadata, mirroring hermes-office's furniture maps.
const FURNITURE_DEFS: Record<FurnitureType, FurnitureDef> = {
  desk: {
    url: deskUrl,
    scale: [1.5, 1.5, 1.5],
    tint: "#8b5e32",
    footprint: [100, 55],
    castShadow: true,
  },
  // The CEO's executive desk (ceo_desk.glb). Keeps its own material (tint
  // null). Scale + footprint are starting values — tune to the model's size.
  executiveDesk: {
    url: executiveDeskUrl,
    scale: [0.85, 0.85, 0.85],
    tint: null,
    footprint: [120, 65],
    castShadow: true,
    origin: "center",
  },
  executiveChair: {
    url: chairUrl,
    scale: [1.2, 1.2, 1.2],
    tint: "#221d18",
    footprint: [32, 32],
    castShadow: true,
  },
  chair: {
    url: chairUrl,
    scale: [1.2, 1.2, 1.2],
    tint: "#4a5568",
    footprint: [24, 24],
    castShadow: true,
  },
  couch: {
    url: couchUrl,
    scale: [1.8, 1.8, 1.8],
    tint: "#3d5575",
    footprint: [100, 40],
    castShadow: true,
  },
  // Upholstered guest armchair (sofa_chair.glb). Origin is at the model's
  // footprint centre (same as how BankDecor places it directly). The raw
  // model is bulky — at 1.5 it dwarfed the executive desk — so it's scaled
  // to read as an armchair next to it.
  sofaChair: {
    url: sofaChairUrl,
    scale: [0.9, 0.9, 0.9],
    tint: "#4a5568",
    footprint: [40, 40],
    castShadow: true,
    origin: "center",
  },
  beanbag: {
    url: beanbagUrl,
    scale: [1.5, 1.5, 1.5],
    tint: "#5a4870",
    footprint: [60, 60],
    castShadow: true,
    placementAnchor: [0.25, 0.05],
  },
  plant: {
    url: plantUrl,
    scale: [1.2, 1.8, 1.2],
    tint: null,
    footprint: [24, 24],
    castShadow: false,
  },
  // Decorative white planter (white_pot.glb). Keeps its own material. The raw
  // model is ~3.5 world units tall (taller than the walls), so it's scaled way
  // down to a ~1 world-unit floor planter.
  whitePot: {
    url: whitePotUrl,
    scale: [0.3, 0.3, 0.3],
    tint: null,
    footprint: [30, 30],
    castShadow: true,
  },
  // Desk monitor (computerScreen.glb), tinted dark and lifted onto the desk
  // surface — values mirror hermes-office's `computer` furniture.
  computer: {
    url: computerUrl,
    scale: [1.1, 1.1, 1.1],
    tint: "#363c58",
    footprint: [30, 20],
    castShadow: true,
    yOffset: 0.61,
  },
  pantry: {
    url: pantryUrl,
    scale: [0.00013, 0.00013, 0.00013],
    tint: null,
    footprint: [120, 80],
    castShadow: true,
    yOffset: 0.007,
    placementAnchor: [-122984.47, -41638.51],
  },
};

/**
 * Clone a loaded GLB scene and apply tint/shadow treatment. `tint === null`
 * keeps the model's own colors (e.g. plants); the desk/chair/couch GLBs are
 * `KHR_materials_unlit`, so the tint lerps their flat base color.
 */
function tintedClone(
  scene: THREE.Object3D,
  tint: string | null,
  castShadow: boolean,
): THREE.Object3D {
  const tintColor = tint ? new THREE.Color(tint) : null;
  const template = scene.clone(true);
  template.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const nextMats = mats.map((material) => {
      // These GLBs ship as KHR_materials_unlit (flat, lighting-independent), so
      // they ignore the key light, IBL environment and shadows. Rebuild each as
      // a lit PBR material that keeps the source colour/texture but now responds
      // to the scene lighting — the core of the realism upgrade.
      const src = material as THREE.Material & {
        color?: THREE.Color;
        map?: THREE.Texture | null;
        vertexColors?: boolean;
      };
      const lit = new THREE.MeshStandardMaterial({
        color: src.color ? src.color.clone() : new THREE.Color("#ffffff"),
        map: src.map ?? null,
        vertexColors: src.vertexColors ?? false,
        transparent: src.transparent ?? false,
        opacity: src.opacity ?? 1,
        alphaTest: src.alphaTest ?? 0,
        side: src.side ?? THREE.FrontSide,
        roughness: 0.72,
        metalness: 0.0,
        envMapIntensity: 0.85,
      });
      if (tintColor) lit.color.lerp(tintColor, 0.8);
      return lit;
    });
    mesh.material = Array.isArray(mesh.material) ? nextMats : nextMats[0];
  });
  return template;
}

/**
 * Render one GLB furniture item placed by canvas (x, y) top-left and rotated
 * around its footprint centre — same placement maths as hermes-office.
 */
function GlbItem({
  type,
  x,
  y,
  facingDeg,
  tint,
  scaleMultiplier = 1,
  yOffset,
}: {
  type: FurnitureType;
  x: number;
  y: number;
  facingDeg: number;
  tint?: string | null;
  /** Uniformly scales the model up (e.g. the larger executive desk). */
  scaleMultiplier?: number;
  /** Override the default vertical lift off the floor. */
  yOffset?: number;
}): React.JSX.Element {
  const def = FURNITURE_DEFS[type];
  // Draco (CDN) and Meshopt (WASM) decoders are disabled — our GLBs are
  // uncompressed and either decoder would violate the renderer CSP.
  const { scene } = useGLTF(def.url, false, false);
  const resolvedTint = tint === undefined ? def.tint : tint;
  const object = useMemo(
    () => tintedClone(scene, resolvedTint, def.castShadow),
    [scene, resolvedTint, def.castShadow],
  );
  const scale = useMemo(
    () =>
      [
        def.scale[0] * scaleMultiplier,
        def.scale[1] * scaleMultiplier,
        def.scale[2] * scaleMultiplier,
      ] as [number, number, number],
    [def.scale, scaleMultiplier],
  );
  const [wx, , wz] = toWorld(x, y);
  const rotY = (facingDeg * Math.PI) / 180;
  const isCenter = def.origin === "center";
  const placementAnchor = def.placementAnchor;
  const pivotX = isCenter ? 0 : def.footprint[0] * SCALE * 0.5;
  const pivotZ = isCenter ? 0 : def.footprint[1] * SCALE * 0.5;
  const anchorX = placementAnchor ? placementAnchor[0] * scale[0] : 0;
  const anchorZ = placementAnchor ? placementAnchor[1] * scale[2] : 0;
  const resolvedYOffset = yOffset ?? def.yOffset ?? 0;

  if (placementAnchor) {
    return (
      <group position={[wx, resolvedYOffset, wz]} rotation={[0, rotY, 0]}>
        <primitive
          object={object}
          position={[-anchorX, 0, -anchorZ]}
          scale={scale}
        />
      </group>
    );
  }

  return (
    <group position={[wx, resolvedYOffset, wz]}>
      <group position={[pivotX, 0, pivotZ]} rotation={[0, rotY, 0]}>
        <group position={[-pivotX, 0, -pivotZ]}>
          <primitive object={object} scale={scale} />
        </group>
      </group>
    </group>
  );
}

function SoftBeanbagDisplay({
  x,
  y,
  facingDeg,
  tint = "#5a4870",
  scaleMultiplier = 1,
}: {
  x: number;
  y: number;
  facingDeg: number;
  tint?: string | null;
  scaleMultiplier?: number;
}): React.JSX.Element {
  const [wx, , wz] = toWorld(x, y);
  const rotY = (facingDeg * Math.PI) / 180;
  const scale = scaleMultiplier;
  const color = tint ?? "#5a4870";

  return (
    <group position={[wx, 0, wz]} rotation={[0, rotY, 0]}>
      <mesh
        position={[0, 0.33 * scale, 0.02 * scale]}
        scale={[1.12 * scale, 0.46 * scale, 1.02 * scale]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.48, 28, 18]} />
        <meshStandardMaterial color={color} roughness={0.74} metalness={0.02} />
      </mesh>
      <mesh
        position={[0, 0.66 * scale, -0.3 * scale]}
        rotation={[0.28, 0, 0]}
        scale={[1.0 * scale, 0.68 * scale, 0.38 * scale]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.42, 28, 18]} />
        <meshStandardMaterial color={color} roughness={0.78} metalness={0.02} />
      </mesh>
      {[-0.38, 0.38].map((side) => (
        <mesh
          key={side}
          position={[side * scale, 0.42 * scale, -0.03 * scale]}
          rotation={[0.04, 0, side > 0 ? -0.32 : 0.32]}
          scale={[0.32 * scale, 0.34 * scale, 0.88 * scale]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.42, 20, 14]} />
          <meshStandardMaterial color={color} roughness={0.78} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

type WorkstationScreenProps = {
  agent?: OfficeAgent;
  task?: OfficeAgentTask;
  activityTitle?: string;
  activityStatus?: string;
  screenOn?: boolean;
  onOpenAgentTask?: (agentId: string) => void;
};

function shortScreenText(text: string, max = 28): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return text.trim();
  return `${chars.slice(0, max - 1).join("")}...`;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const chars = Array.from(text);
  let line = "";
  let lineCount = 0;
  for (const char of chars) {
    const next = `${line}${char}`;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = char.trimStart();
      lineCount += 1;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }
}

function useMonitorScreenTexture({
  agent,
  task,
  activityTitle,
  activityStatus,
  screenOn,
}: WorkstationScreenProps): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const bg = screenOn ? "#082338" : "#101318";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = screenOn ? "rgba(14,165,233,0.18)" : "rgba(148,163,184,0.08)";
      ctx.fillRect(0, 0, canvas.width, 58);
      ctx.fillStyle = screenOn ? "#7dd3fc" : "#334155";
      ctx.fillRect(24, 76, 464, 2);
      ctx.fillRect(24, 204, 464, 2);

      if (screenOn) {
        ctx.font = "800 30px system-ui, Microsoft YaHei, sans-serif";
        ctx.fillStyle = "#e0f2fe";
        ctx.fillText("牧马任务", 28, 39);

        ctx.font = "600 20px system-ui, Microsoft YaHei, sans-serif";
        ctx.fillStyle = "#93c5fd";
        ctx.fillText(agent?.name ? `@${shortScreenText(agent.name, 16)}` : "工作站", 330, 38);

        ctx.font = "700 34px system-ui, Microsoft YaHei, sans-serif";
        ctx.fillStyle = "#f8fafc";
        const title =
          task?.title ??
          (activityTitle ? `当前指令：${activityTitle}` : "暂无执行任务");
        drawWrappedText(
          ctx,
          shortScreenText(title, 36),
          28,
          122,
          456,
          38,
          2,
        );

        ctx.font = "600 18px system-ui, Microsoft YaHei, sans-serif";
        ctx.fillStyle = task || activityTitle ? "#86efac" : "#fbbf24";
        const status = task
          ? `状态：${task.status}`
          : activityTitle
            ? (activityStatus ?? "状态：处理中")
            : "当前没有分配任务";
        ctx.fillText(
          status,
          28,
          232,
        );
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [activityStatus, activityTitle, agent?.name, screenOn, task?.status, task?.title]);
}

function monitorUserData({
  agent,
  onOpenAgentTask,
}: WorkstationScreenProps): Record<string, unknown> | undefined {
  if (!agent || !onOpenAgentTask) return undefined;
  return {
    aimashiInteractionKind: "workstation-screen",
    aimashiHeldItem: "taskCard",
    aimashiInteractionProfile: {
      kind: "screen",
      action: "click",
      heldItem: "taskCard",
      label: "任务屏幕",
      hand: "right",
    },
    aimashiInteract: () => onOpenAgentTask(agent.id),
  };
}

function deskHandColor(screen?: WorkstationScreenProps): string {
  return screen?.agent?.avatarProfile?.body.skinTone ?? "#c88d64";
}

function DeskHands({
  color,
  scale = 1,
  left,
  right,
  y,
}: {
  color: string;
  scale?: number;
  left: [number, number];
  right: [number, number];
  y: number;
}): React.JSX.Element {
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const handRadius = 0.075 * scale;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 8.5;
    if (leftRef.current) {
      leftRef.current.position.set(
        left[0],
        y + Math.max(0, Math.sin(t)) * 0.018 * scale,
        left[1],
      );
      leftRef.current.rotation.x = 0.03 + Math.sin(t * 0.7) * 0.018;
    }
    if (rightRef.current) {
      rightRef.current.position.set(
        right[0] + Math.sin(t * 0.55) * 0.012 * scale,
        y + Math.max(0, Math.sin(t + Math.PI)) * 0.014 * scale,
        right[1],
      );
      rightRef.current.rotation.z = -0.12 + Math.sin(t * 0.6) * 0.025;
    }
  });

  return (
    <group>
      <mesh
        position={[left[0] * 0.55, y - 0.02 * scale, (left[1] - 0.28 * scale)]}
        rotation={[0.1, -0.12, 0.02]}
        scale={[0.55, 0.16, 1.7]}
        castShadow
      >
        <boxGeometry args={[handRadius, handRadius, handRadius]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      <mesh
        position={[right[0] * 0.55, y - 0.02 * scale, (right[1] - 0.28 * scale)]}
        rotation={[0.1, 0.12, -0.02]}
        scale={[0.55, 0.16, 1.7]}
        castShadow
      >
        <boxGeometry args={[handRadius, handRadius, handRadius]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      <mesh
        ref={leftRef}
        position={[left[0], y, left[1]]}
        rotation={[0.03, 0, 0.16]}
        scale={[1.45, 0.26, 0.82]}
        castShadow
      >
        <sphereGeometry args={[handRadius, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.66} />
      </mesh>
      <mesh
        ref={rightRef}
        position={[right[0], y, right[1]]}
        rotation={[0.03, 0, -0.12]}
        scale={[1.22, 0.24, 0.95]}
        castShadow
      >
        <sphereGeometry args={[handRadius, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.66} />
      </mesh>
    </group>
  );
}

function ExecutiveDeskDisplay({
  x,
  y,
  facingDeg,
  scaleMultiplier = 1,
  screen,
}: {
  x: number;
  y: number;
  facingDeg: number;
  scaleMultiplier?: number;
  screen?: WorkstationScreenProps;
}): React.JSX.Element {
  const [wx, , wz] = toWorld(x, y);
  const rotY = (facingDeg * Math.PI) / 180;
  const scale = scaleMultiplier;
  const monitorTexture = useMonitorScreenTexture(screen ?? {});
  const monitorData = monitorUserData(screen ?? {});
  const deskW = 3.72 * scale;
  const deskD = 1.62 * scale;
  const topH = 0.11 * scale;
  const topY = 0.82 * scale;
  const wood = "#5a3924";
  const woodDark = "#3d2619";
  const trim = "#a88357";
  const leather = "#26201c";
  const metal = "#1f2937";
  const screenBody = "#1a1f27";

  return (
    <group position={[wx, 0, wz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, topY, 0]} castShadow receiveShadow>
        <boxGeometry args={[deskW, topH, deskD]} />
        <meshStandardMaterial color={wood} roughness={0.38} metalness={0.04} />
      </mesh>
      <mesh position={[0, topY + topH / 2 + 0.012 * scale, 0]} receiveShadow>
        <boxGeometry args={[deskW - 0.08 * scale, 0.018 * scale, deskD - 0.08 * scale]} />
        <meshStandardMaterial color="#6c442a" roughness={0.3} metalness={0.06} />
      </mesh>
      <mesh position={[0, topY + topH / 2 + 0.021 * scale, -0.1 * scale]} receiveShadow>
        <boxGeometry args={[1.86 * scale, 0.014 * scale, 0.88 * scale]} />
        <meshStandardMaterial color={leather} roughness={0.86} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.43 * scale, deskD / 2 - 0.045 * scale]} castShadow receiveShadow>
        <boxGeometry args={[deskW - 0.32 * scale, 0.58 * scale, 0.05 * scale]} />
        <meshStandardMaterial color={woodDark} roughness={0.44} metalness={0.04} />
      </mesh>
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * (deskW / 2 - 0.56 * scale), 0.39 * scale, 0.06 * scale]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.9 * scale, 0.78 * scale, 1.18 * scale]} />
            <meshStandardMaterial color={woodDark} roughness={0.42} metalness={0.04} />
          </mesh>
          {[0.2, 0, -0.2].map((z) => (
            <mesh
              key={z}
              position={[0, 0.17 * scale + (z === 0 ? 0 : -0.02 * scale), z * scale]}
              castShadow
            >
              <boxGeometry args={[0.72 * scale, 0.16 * scale, 0.03 * scale]} />
              <meshStandardMaterial color="#6d4a31" roughness={0.38} />
            </mesh>
          ))}
          {[0.2, 0, -0.2].map((z) => (
            <mesh
              key={`handle-${z}`}
              position={[0, 0.17 * scale + (z === 0 ? 0 : -0.02 * scale), z * scale + 0.03 * scale]}
              castShadow
            >
              <boxGeometry args={[0.18 * scale, 0.018 * scale, 0.018 * scale]} />
              <meshStandardMaterial color={trim} roughness={0.34} metalness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`wing-${side}`}
          position={[side * (deskW / 2 - 0.05 * scale), 0.44 * scale, 0]}
          castShadow
        >
          <boxGeometry args={[0.05 * scale, 0.76 * scale, deskD - 0.14 * scale]} />
          <meshStandardMaterial color={trim} roughness={0.36} metalness={0.22} />
        </mesh>
      ))}
      <group
        position={[0, 1.08 * scale, -0.13 * scale]}
        userData={monitorData}
        onClick={(event) => {
          event.stopPropagation();
          if (screen?.agent && screen.onOpenAgentTask) {
            screen.onOpenAgentTask(screen.agent.id);
          }
        }}
      >
        <mesh castShadow>
          <boxGeometry args={[1.02 * scale, 0.57 * scale, 0.06 * scale]} />
          <meshStandardMaterial color={screenBody} roughness={0.4} metalness={0.18} />
        </mesh>
        <mesh position={[0, 0, -0.035 * scale]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.9 * scale, 0.47 * scale]} />
          <meshStandardMaterial
            map={monitorTexture}
            side={THREE.FrontSide}
            emissive={screen?.screenOn ? "#7dd3fc" : "#111827"}
            emissiveMap={monitorTexture}
            emissiveIntensity={screen?.screenOn ? 0.82 : 0.08}
            roughness={0.35}
            toneMapped={false}
          />
        </mesh>
      </group>
      <mesh position={[0, 0.88 * scale, -0.13 * scale]} castShadow>
        <boxGeometry args={[0.12 * scale, 0.28 * scale, 0.08 * scale]} />
        <meshStandardMaterial color={metal} roughness={0.42} metalness={0.22} />
      </mesh>
      <mesh position={[0, 0.76 * scale, -0.11 * scale]} castShadow>
        <boxGeometry args={[0.44 * scale, 0.025 * scale, 0.24 * scale]} />
        <meshStandardMaterial color={metal} roughness={0.44} metalness={0.2} />
      </mesh>
      <mesh position={[0.02 * scale, topY + 0.02 * scale, -0.44 * scale]} castShadow>
        <boxGeometry args={[0.7 * scale, 0.03 * scale, 0.19 * scale]} />
        <meshStandardMaterial color="#17191f" roughness={0.5} metalness={0.12} />
      </mesh>
      <mesh position={[0.5 * scale, topY + 0.017 * scale, -0.42 * scale]} castShadow>
        <boxGeometry args={[0.14 * scale, 0.028 * scale, 0.18 * scale]} />
        <meshStandardMaterial color="#101215" roughness={0.44} metalness={0.14} />
      </mesh>
      <mesh position={[0.62 * scale, topY + 0.032 * scale, -0.4 * scale]} castShadow>
        <sphereGeometry args={[0.032 * scale, 16, 12]} />
        <meshStandardMaterial color="#1c212b" roughness={0.42} metalness={0.18} />
      </mesh>
      {SHOW_WORKSTATION_HELPER_HANDS && screen?.screenOn && (screen.task || screen.activityTitle) ? (
        <DeskHands
          color={deskHandColor(screen)}
          scale={scale}
          left={[-0.22 * scale, -0.46 * scale]}
          right={[0.56 * scale, -0.43 * scale]}
          y={topY + 0.07 * scale}
        />
      ) : null}
      <mesh position={[-deskW / 2 + 0.32 * scale, topY + 0.028 * scale, -0.33 * scale]} castShadow>
        <boxGeometry args={[0.42 * scale, 0.024 * scale, 0.2 * scale]} />
        <meshStandardMaterial color="#d8d0c4" roughness={0.78} />
      </mesh>
      <mesh position={[-deskW / 2 + 0.22 * scale, topY + 0.038 * scale, -0.32 * scale]} castShadow>
        <boxGeometry args={[0.06 * scale, 0.01 * scale, 0.14 * scale]} />
        <meshStandardMaterial color={trim} roughness={0.34} metalness={0.34} />
      </mesh>
    </group>
  );
}

function ExecutiveChairDisplay({
  x,
  y,
  facingDeg,
  tint = "#221d18",
  scaleMultiplier = 1,
}: {
  x: number;
  y: number;
  facingDeg: number;
  tint?: string | null;
  scaleMultiplier?: number;
}): React.JSX.Element {
  const [wx, , wz] = toWorld(x, y);
  const rotY = (facingDeg * Math.PI) / 180;
  const scale = scaleMultiplier;
  const leather = tint ?? "#221d18";
  const leatherDark = "#15120f";
  const metal = "#2a313c";
  const chrome = "#7b8794";

  return (
    <group position={[wx, 0, wz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.54 * scale, -0.01 * scale]} castShadow receiveShadow>
        <boxGeometry args={[0.8 * scale, 0.13 * scale, 0.72 * scale]} />
        <meshStandardMaterial color={leather} roughness={0.56} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.6 * scale, -0.16 * scale]} castShadow>
        <boxGeometry args={[0.68 * scale, 0.06 * scale, 0.5 * scale]} />
        <meshStandardMaterial color="#3a2d25" roughness={0.58} metalness={0.03} />
      </mesh>
      <mesh position={[0, 1.18 * scale, -0.37 * scale]} rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.78 * scale, 1.12 * scale, 0.13 * scale]} />
        <meshStandardMaterial color={leather} roughness={0.54} metalness={0.04} />
      </mesh>
      <mesh position={[0, 1.56 * scale, -0.47 * scale]} rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.44 * scale, 0.24 * scale, 0.12 * scale]} />
        <meshStandardMaterial color={leatherDark} roughness={0.5} metalness={0.05} />
      </mesh>
      {[-0.45, 0.45].map((xPos) => (
        <group key={xPos} position={[xPos * scale, 0.78 * scale, -0.03 * scale]}>
          <mesh castShadow>
            <boxGeometry args={[0.15 * scale, 0.08 * scale, 0.58 * scale]} />
            <meshStandardMaterial color={leatherDark} roughness={0.52} metalness={0.04} />
          </mesh>
          <mesh position={[0, -0.17 * scale, 0]} castShadow>
            <boxGeometry args={[0.06 * scale, 0.32 * scale, 0.06 * scale]} />
            <meshStandardMaterial color={metal} roughness={0.42} metalness={0.2} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.3 * scale, -0.02 * scale]} castShadow>
        <cylinderGeometry args={[0.06 * scale, 0.075 * scale, 0.5 * scale, 16]} />
        <meshStandardMaterial color={metal} roughness={0.4} metalness={0.26} />
      </mesh>
      {[0, (Math.PI * 2) / 5, (Math.PI * 4) / 5, (Math.PI * 6) / 5, (Math.PI * 8) / 5].map(
        (rotation) => (
          <group key={rotation} rotation={[0, rotation, 0]}>
            <mesh position={[0, 0.08 * scale, 0.34 * scale]} castShadow>
              <boxGeometry args={[0.11 * scale, 0.04 * scale, 0.54 * scale]} />
              <meshStandardMaterial color={chrome} roughness={0.34} metalness={0.46} />
            </mesh>
            <mesh position={[0, 0.04 * scale, 0.6 * scale]} castShadow>
              <cylinderGeometry args={[0.05 * scale, 0.05 * scale, 0.09 * scale, 12]} />
              <meshStandardMaterial color={metal} roughness={0.46} metalness={0.24} />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}

function ModernWorkDesk({
  station,
  screen,
}: {
  station: Workstation;
  screen?: WorkstationScreenProps;
}): React.JSX.Element {
  const deskW = 150 * SCALE;
  const deskD = 76 * SCALE;
  const [wx, , wz] = toWorld(station.deskX, station.deskY);
  const rotY = (station.deskFacingDeg * Math.PI) / 180;
  const centerX = wx + deskW / 2;
  const centerZ = wz + deskD / 2;
  const monitorTexture = useMonitorScreenTexture(screen ?? {});
  const monitorData = monitorUserData(screen ?? {});
  const white = "#f7f8fa";
  const wood = "#e5c584";
  const blue = "#1789c9";
  const dark = "#111827";

  return (
    <group position={[centerX, 0, centerZ]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[deskW, 0.12, deskD]} />
        <meshStandardMaterial color={wood} roughness={0.46} />
      </mesh>
      <mesh position={[0, 0.79, 0]} receiveShadow>
        <boxGeometry args={[deskW - 0.08, 0.018, deskD - 0.08]} />
        <meshStandardMaterial color="#f0d79e" roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.58, deskD / 2 + 0.025]} castShadow>
        <boxGeometry args={[deskW, 0.72, 0.07]} />
        <meshStandardMaterial
          color={blue}
          roughness={0.34}
          metalness={0.08}
          envMapIntensity={1.0}
        />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh
          key={`${sx}-${sz}`}
          position={[sx * (deskW / 2 - 0.12), 0.35, sz * (deskD / 2 - 0.12)]}
          castShadow
        >
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color={white} roughness={0.58} />
        </mesh>
      ))}
      <mesh position={[deskW / 2 - 0.38, 0.34, 0.16]} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.62, 0.62]} />
        <meshStandardMaterial color={white} roughness={0.54} />
      </mesh>
      {[-0.08, 0.12].map((y) => (
        <mesh key={y} position={[deskW / 2 - 0.38, 0.4 + y, -0.16]} castShadow>
          <boxGeometry args={[0.36, 0.045, 0.025]} />
          <meshStandardMaterial color={blue} roughness={0.42} />
        </mesh>
      ))}
      <group position={[0.06, 1.08, 0.08]} userData={monitorData}>
        <group
          onClick={(event) => {
            event.stopPropagation();
            if (screen?.agent && screen.onOpenAgentTask) {
              screen.onOpenAgentTask(screen.agent.id);
            }
          }}
        >
        <mesh castShadow>
          <boxGeometry args={[0.72, 0.42, 0.055]} />
          <meshStandardMaterial color={dark} roughness={0.55} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0, -0.031]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.62, 0.32]} />
          <meshStandardMaterial
            map={monitorTexture}
            side={THREE.FrontSide}
            emissive={screen?.screenOn ? "#7dd3fc" : "#111827"}
            emissiveMap={monitorTexture}
            emissiveIntensity={screen?.screenOn ? 0.88 : 0.06}
            roughness={0.34}
            toneMapped={false}
          />
        </mesh>
        </group>
      </group>
      <mesh position={[0.06, 0.84, 0.08]} castShadow>
        <boxGeometry args={[0.08, 0.28, 0.055]} />
        <meshStandardMaterial color="#2d3748" roughness={0.52} />
      </mesh>
      <mesh position={[0.06, 0.81, 0.08]} castShadow>
        <boxGeometry args={[0.36, 0.035, 0.2]} />
        <meshStandardMaterial color="#2d3748" roughness={0.52} />
      </mesh>
      <mesh position={[-0.36, 0.795, -0.3]} castShadow>
        <boxGeometry args={[0.54, 0.024, 0.18]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[0.22, 0.805, -0.3]} castShadow>
        <boxGeometry args={[0.14, 0.026, 0.2]} />
        <meshStandardMaterial color="#111827" roughness={0.42} />
      </mesh>
      {SHOW_WORKSTATION_HELPER_HANDS && screen?.screenOn && (screen.task || screen.activityTitle) ? (
        <DeskHands
          color={deskHandColor(screen)}
          left={[-0.2, -0.31]}
          right={[0.24, -0.31]}
          y={0.835}
        />
      ) : null}
      <group position={[-deskW / 2 + 0.32, 0.88, 0.18]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.12, 0.1, 0.16, 18]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.21, 0]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial color="#31a36b" roughness={0.66} />
        </mesh>
      </group>
    </group>
  );
}

function ModernTaskChair({
  station,
}: {
  station: Workstation;
}): React.JSX.Element {
  const [wx, , wz] = toWorld(station.seatX, station.seatY);
  const rotY = (station.chairFacingDeg * Math.PI) / 180;
  const dark = "#141923";
  const accent = "#f59e0b";

  return (
    <group position={[wx, 0, wz]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.32, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.07, 0.34]} />
        <meshStandardMaterial color={dark} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.72, -0.42]} rotation={[-0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.44, 0.055]} />
        <meshStandardMaterial color={dark} roughness={0.62} />
      </mesh>
      {[-0.2, 0, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.72, -0.455]} rotation={[-0.1, 0, 0]}>
          <boxGeometry args={[0.035, 0.36, 0.025]} />
          <meshStandardMaterial color="#4b5563" roughness={0.48} />
        </mesh>
      ))}
      <mesh position={[0, 0.98, -0.49]} rotation={[-0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.38, 0.1, 0.06]} />
        <meshStandardMaterial color={accent} roughness={0.55} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.55, -0.01]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0.36]} />
          <meshStandardMaterial color="#1f2937" roughness={0.52} />
        </mesh>
      ))}
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.45, 14]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.18} />
      </mesh>
      {[0, Math.PI / 2].map((rotation) => (
        <mesh key={rotation} position={[0, 0.04, 0]} rotation={[0, rotation, 0]}>
          <boxGeometry args={[0.72, 0.04, 0.08]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>
      ))}
      {[
        [0.34, 0.34],
        [-0.34, 0.34],
        [0.34, -0.34],
        [-0.34, -0.34],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.025, z]}>
          <cylinderGeometry args={[0.055, 0.055, 0.045, 12]} />
          <meshStandardMaterial color="#111827" roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

// Executive desk treatment: a real wooden table (its own material) + dark
// chair, flanked by potted plants so the CEO's corner reads as a premium
// private office.
const EXEC_CHAIR_TINT = "#221d18";
const EXEC_DESK_SCALE = 1.06;
const EXEC_CHAIR_SCALE = 1;
// Plant offsets (canvas units from the desk's top-left). Placed outside the
// up-scaled desk's visual width so they flank rather than overlap it.
const EXEC_PLANT_LEFT_DX = -145;
const EXEC_PLANT_RIGHT_DX = 195;
const EXEC_PLANT_DY = 18;

function ExecutiveWorkstation({
  station,
  screen,
}: {
  station: Workstation;
  screen?: WorkstationScreenProps;
}): React.JSX.Element {
  return (
    <group>
      <ExecutiveDeskDisplay
        x={station.deskX}
        y={station.deskY}
        facingDeg={station.deskFacingDeg}
        scaleMultiplier={EXEC_DESK_SCALE}
        screen={screen}
      />
      <ExecutiveChairDisplay
        x={station.seatX}
        y={station.seatY}
        facingDeg={station.chairFacingDeg}
        tint={EXEC_CHAIR_TINT}
        scaleMultiplier={EXEC_CHAIR_SCALE}
      />
      <GlbItem
        type="plant"
        x={station.deskX + EXEC_PLANT_LEFT_DX}
        y={station.deskY + EXEC_PLANT_DY}
        facingDeg={0}
      />
      <GlbItem
        type="plant"
        x={station.deskX + EXEC_PLANT_RIGHT_DX}
        y={station.deskY + EXEC_PLANT_DY}
        facingDeg={0}
      />
    </group>
  );
}

/** Render an arbitrary list of furniture placements (e.g. the rest room). */
export const FurniturePieces = memo(function FurniturePieces({
  pieces,
}: {
  pieces: FurniturePlacement[];
}): React.JSX.Element {
  return (
    <>
      {pieces.map((piece) => {
        if (piece.type === "executiveDesk") {
          return (
            <ExecutiveDeskDisplay
              key={piece.id}
              x={piece.x}
              y={piece.y}
              facingDeg={piece.facingDeg}
              scaleMultiplier={piece.scaleMultiplier}
            />
          );
        }
        if (piece.type === "executiveChair") {
          return (
            <ExecutiveChairDisplay
              key={piece.id}
              x={piece.x}
              y={piece.y}
              facingDeg={piece.facingDeg}
              tint={piece.tint}
              scaleMultiplier={piece.scaleMultiplier}
            />
          );
        }
        if (piece.type === "beanbag" && piece.variant === "softBeanbag") {
          return (
            <SoftBeanbagDisplay
              key={piece.id}
              x={piece.x}
              y={piece.y}
              facingDeg={piece.facingDeg}
              tint={piece.tint}
              scaleMultiplier={piece.scaleMultiplier}
            />
          );
        }
        return (
          <GlbItem
            key={piece.id}
            type={piece.type}
            x={piece.x}
            y={piece.y}
            facingDeg={piece.facingDeg}
            tint={piece.tint}
            scaleMultiplier={piece.scaleMultiplier}
            yOffset={piece.yOffset}
          />
        );
      })}
    </>
  );
});

/** Render every workstation (a desk + its chair) in the work area. */
export const Workstations = memo(function Workstations({
  workstations,
  agents,
  deskSeatedAgentIds,
  agentTaskById,
  agentBehaviorById,
  onOpenAgentTask,
}: {
  workstations: Workstation[];
  agents: OfficeAgent[];
  deskSeatedAgentIds: Set<string>;
  agentTaskById: Record<string, OfficeAgentTask>;
  agentBehaviorById?: Record<string, AgentBehaviorIntent>;
  onOpenAgentTask: (agentId: string) => void;
}): React.JSX.Element {
  const agentById = useMemo(() => {
    const map = new Map<string, OfficeAgent>();
    for (const agent of agents) map.set(agent.id, agent);
    return map;
  }, [agents]);

  return (
    <>
      {workstations.map((w) => {
        const agent = w.agentId ? agentById.get(w.agentId) : undefined;
        const behavior = agent ? agentBehaviorById?.[agent.id] : undefined;
        const activityTitle =
          behavior?.kind === "working_at_desk" && behavior.label
            ? behavior.label
            : undefined;
        const screen: WorkstationScreenProps | undefined = agent
          ? {
              agent,
              task: agentTaskById[agent.id],
              activityTitle,
              activityStatus: activityTitle ? "状态：处理中" : undefined,
              screenOn: deskSeatedAgentIds.has(agent.id) && agent.status !== "error",
              onOpenAgentTask,
            }
          : undefined;
        return w.isExecutive ? (
          <ExecutiveWorkstation key={w.id} station={w} screen={screen} />
        ) : (
          <group key={w.id}>
            <ModernWorkDesk station={w} screen={screen} />
            <ModernTaskChair station={w} />
          </group>
        );
      })}
    </>
  );
});

useGLTF.preload(deskUrl, false, false);
useGLTF.preload(executiveDeskUrl, false, false);
useGLTF.preload(chairUrl, false, false);
useGLTF.preload(couchUrl, false, false);
useGLTF.preload(beanbagUrl, false, false);
useGLTF.preload(plantUrl, false, false);
useGLTF.preload(whitePotUrl, false, false);
useGLTF.preload(computerUrl, false, false);
useGLTF.preload(pantryUrl, false, false);
