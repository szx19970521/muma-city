import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { toWorld } from "../core/geometry";
import { GYM_ROOM, TOOL_ROOM } from "../layout";

type Destination =
  | "chat"
  | "models"
  | "kanban"
  | "memory"
  | "skills"
  | "tools"
  | "schedules"
  | "gateway"
  | "settings";

interface SceneInteractablesProps {
  currentModel: string;
  currentProvider: string;
  gatewayOnline: boolean;
  directPointerEnabled: boolean;
  onOpenView: (view: Destination) => void;
  onStartChat: () => void;
  onToggleEngine: () => void;
}

function stopClick(
  e: ThreeEvent<MouseEvent>,
  action: () => void,
  directPointerEnabled: boolean,
): void {
  e.stopPropagation();
  if (!directPointerEnabled) return;
  if (document.pointerLockElement) {
    void document.exitPointerLock();
  }
  action();
}

function setCursor(cursor: string, directPointerEnabled = true): void {
  if (!directPointerEnabled) return;
  document.body.style.cursor = cursor;
}

function useTextTexture({
  text,
  width = 768,
  height = 192,
  fontSize = 64,
  color = "#102033",
  background,
  weight = 800,
}: {
  text: string;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  background?: string;
  weight?: number;
}): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, width, height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = color;
    ctx.font = `${weight} ${fontSize}px "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, [background, color, fontSize, height, text, weight, width]);
}

function LabelPlane({
  text,
  position,
  rotation = [0, 0, 0],
  size,
  color,
  background,
  fontSize,
  weight,
}: {
  text: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number];
  color?: string;
  background?: string;
  fontSize?: number;
  weight?: number;
}): React.JSX.Element {
  const texture = useTextTexture({ text, color, background, fontSize, weight });
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function compactEngineLabel(value: string): string {
  const label = value.trim() || "未选择模型";
  return label.length > 18 ? `${label.slice(0, 17)}...` : label;
}

function BoardColumn(_: {
  x: number;
  title: string;
  color: string;
}): React.JSX.Element {
  return <></>;
}

function TaskWhiteboard({
  directPointerEnabled,
  onOpen,
}: {
  directPointerEnabled: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <group
      position={[-10.8, 1.55, 16.02]}
      rotation={[0, Math.PI, 0]}
      userData={{
        aimashiHeldItem: "taskCard",
        aimashiInteract: onOpen,
        aimashiInteractionProfile: {
          kind: "screen",
          action: "click",
          heldItem: "taskCard",
          label: "任务白板",
          hand: "right",
        },
      }}
      onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
      onPointerOver={() => setCursor("pointer", directPointerEnabled)}
      onPointerOut={() => setCursor("")}
    >
      <mesh position={[0, 0, 0.07]}>
        <planeGeometry args={[2.7, 1.5]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );

  return (
    <group
      position={[3.45, 2.38, -15.95]}
      userData={{
        aimashiHeldItem: "taskCard",
        aimashiInteract: onOpen,
        aimashiInteractionProfile: {
          kind: "screen",
          action: "click",
          heldItem: "taskCard",
          label: "任务白板",
          hand: "right",
        },
      }}
      onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
      onPointerOver={() => setCursor("pointer", directPointerEnabled)}
      onPointerOut={() => setCursor("")}
    >
      <mesh castShadow>
        <boxGeometry args={[8.05, 3.35, 0.16]} />
        <meshStandardMaterial color="#d5c7a7" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, 0.085]}>
        <planeGeometry args={[7.62, 2.92]} />
        <meshStandardMaterial color="#fffdf7" roughness={0.76} />
      </mesh>
      <LabelPlane
        text="任务白板"
        position={[-2.92, 1.21, 0.18]}
        size={[1.75, 0.42]}
        color="#003f7a"
        fontSize={74}
      />
      <BoardColumn x={-2.45} title="待办" color="#0f5f9e" />
      <BoardColumn x={0} title="进行中" color="#f5c518" />
      <BoardColumn x={2.45} title="完成" color="#22c55e" />
      {[
        [-3.76, 1.48, "#0f5f9e"],
        [3.76, 1.48, "#ef4444"],
      ].map(([x, y, color]) => (
        <mesh key={`${x}`} position={[x as number, y as number, 0.18]}>
          <sphereGeometry args={[0.085, 16, 16]} />
          <meshStandardMaterial color={color as string} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function EngineStatusBadge({
  model,
  provider,
  yaw,
}: {
  model: string;
  provider: string;
  yaw: number;
}): React.JSX.Element {
  const radius = 0.955;
  const x = Math.sin(yaw) * radius;
  const z = Math.cos(yaw) * radius;
  return (
    <group position={[x, 1.14, z]} rotation={[0, yaw, 0]}>
      <LabelPlane
        text="马脑引擎"
        position={[0, 0.2, 0]}
        size={[1.2, 0.2]}
        color="#0b4675"
        fontSize={54}
        weight={900}
      />
      <LabelPlane
        text={model}
        position={[0, -0.04, 0]}
        size={[1.42, 0.34]}
        color="#102033"
        fontSize={78}
        weight={900}
      />
      <LabelPlane
        text={provider}
        position={[0, -0.27, 0]}
        size={[1.18, 0.18]}
        color="#315b77"
        fontSize={38}
        weight={700}
      />
    </group>
  );
}

function BrainEngine({
  currentModel,
  currentProvider,
  directPointerEnabled,
  onOpen,
}: {
  currentModel: string;
  currentProvider: string;
  directPointerEnabled: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const modelLabel = compactEngineLabel(currentModel);
  const providerLabel = compactEngineLabel(currentProvider);
  return (
    <group
      position={[13.0, 0.08, -10.1]}
      rotation={[0, -0.55, 0]}
      userData={{ aimashiInteract: onOpen }}
      onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
      onPointerOver={() => setCursor("pointer", directPointerEnabled)}
      onPointerOut={() => setCursor("")}
    >
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <cylinderGeometry args={[1.72, 2.1, 0.28, 48]} />
        <meshStandardMaterial color="#0b4675" roughness={0.48} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.42, 1.62, 0.58, 48]} />
        <meshStandardMaterial
          color="#0f5f9e"
          roughness={0.32}
          metalness={0.35}
          emissive="#003f7a"
          emissiveIntensity={0.18}
        />
      </mesh>
      <mesh position={[0, 0.98, 0]} castShadow>
        <sphereGeometry args={[0.92, 48, 32]} />
        <meshStandardMaterial
          color="#eaf6ff"
          roughness={0.15}
          metalness={0.18}
          emissive="#88cfff"
          emissiveIntensity={0.24}
        />
      </mesh>
      <mesh position={[0, 0.98, 0]} rotation={[0.12, 0.15, 0]}>
        <torusGeometry args={[1.12, 0.044, 10, 64]} />
        <meshStandardMaterial color="#f5c518" emissive="#f5c518" />
      </mesh>
      <EngineStatusBadge model={modelLabel} provider={providerLabel} yaw={0} />
      <EngineStatusBadge
        model={modelLabel}
        provider={providerLabel}
        yaw={(Math.PI * 2) / 3}
      />
      <EngineStatusBadge
        model={modelLabel}
        provider={providerLabel}
        yaw={-(Math.PI * 2) / 3}
      />
    </group>
  );
}

function MemoryLibrary({
  directPointerEnabled,
  onOpen,
}: {
  directPointerEnabled: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const bookColors = ["#0f3f6f", "#174f3a", "#7a4a16", "#33216d"];
  const fileColors = [
    "#243447",
    "#315f72",
    "#5b4636",
    "#1f4f46",
    "#6f5523",
    "#2c365f",
  ];
  return (
    <group
      position={[8.2, 0.05, -12.82]}
      rotation={[0, 0, 0]}
      userData={{
        aimashiHeldItem: "book",
        aimashiInteract: onOpen,
        aimashiInteractionProfile: {
          kind: "shelf",
          action: "grab_shelf",
          heldItem: "book",
          label: "记忆库",
          hand: "both",
        },
      }}
      onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
      onPointerOver={() => setCursor("pointer", directPointerEnabled)}
      onPointerOut={() => setCursor("")}
    >
      <mesh position={[0, 1.16, 0.03]} castShadow receiveShadow>
        <boxGeometry args={[4.18, 2.66, 0.54]} />
        <meshStandardMaterial color="#2f2119" roughness={0.62} metalness={0.06} />
      </mesh>
      <mesh position={[0, 1.18, 0.34]} receiveShadow>
        <boxGeometry args={[3.72, 2.2, 0.08]} />
        <meshStandardMaterial color="#111827" roughness={0.58} />
      </mesh>
      <mesh position={[0, 2.62, 0.04]} castShadow>
        <boxGeometry args={[4.38, 0.26, 0.62]} />
        <meshStandardMaterial color="#1f1712" roughness={0.52} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.06, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[4.34, 0.18, 0.62]} />
        <meshStandardMaterial color="#1b1410" roughness={0.54} metalness={0.1} />
      </mesh>
      {[-2.02, 0, 2.02].map((x) => (
        <mesh key={`memory-upright-${x}`} position={[x, 1.25, 0.43]} castShadow>
          <boxGeometry args={[0.07, 2.44, 0.18]} />
          <meshStandardMaterial color="#b58b54" roughness={0.34} metalness={0.42} />
        </mesh>
      ))}
      {[0.54, 1.22, 1.9].map((y) => (
        <mesh key={`memory-shelf-${y}`} position={[0, y, 0.43]} castShadow>
          <boxGeometry args={[3.86, 0.07, 0.26]} />
          <meshStandardMaterial color="#5a3a24" roughness={0.5} metalness={0.04} />
        </mesh>
      ))}
      {Array.from({ length: 12 }).map((_, index) => {
        const row = Math.floor(index / 6);
        const col = index % 6;
        return (
          <mesh
            key={`archive-file-${index}`}
            position={[-1.52 + col * 0.61, 0.37 + row * 0.68, 0.58]}
            castShadow
          >
            <boxGeometry args={[0.42, 0.46, 0.22]} />
            <meshStandardMaterial
              color={fileColors[index % fileColors.length]}
              roughness={0.56}
              metalness={0.02}
            />
          </mesh>
        );
      })}
      {Array.from({ length: 14 }).map((_, index) => {
        const row = Math.floor(index / 7);
        const col = index % 7;
        return (
          <mesh
            key={`memory-book-${index}`}
            position={[-1.54 + col * 0.5, 1.58 + row * 0.56, 0.58]}
            castShadow
          >
            <boxGeometry args={[0.26, 0.48 + (index % 3) * 0.06, 0.15]} />
            <meshStandardMaterial
              color={bookColors[index % bookColors.length]}
              roughness={0.58}
            />
          </mesh>
        );
      })}
      {[-1.02, 1.02].map((x) => (
        <mesh key={`memory-glass-${x}`} position={[x, 1.42, 0.68]}>
          <boxGeometry args={[1.92, 2.1, 0.025]} />
          <meshStandardMaterial
            color="#9fc8d6"
            roughness={0.18}
            metalness={0.08}
            transparent
            opacity={0.24}
            depthWrite={false}
          />
        </mesh>
      ))}
      {[-1.96, -0.04, 0.04, 1.96].map((x) => (
        <mesh key={`memory-door-rail-${x}`} position={[x, 1.42, 0.72]} castShadow>
          <boxGeometry args={[0.035, 2.14, 0.04]} />
          <meshStandardMaterial color="#a87c3f" roughness={0.32} metalness={0.52} />
        </mesh>
      ))}
      {[0.38, 2.46].map((y) => (
        <mesh key={`memory-door-cross-${y}`} position={[0, y, 0.72]} castShadow>
          <boxGeometry args={[3.92, 0.035, 0.04]} />
          <meshStandardMaterial color="#a87c3f" roughness={0.32} metalness={0.52} />
        </mesh>
      ))}
      {[-0.16, 0.16].map((x) => (
        <mesh key={`memory-handle-${x}`} position={[x, 1.42, 0.77]} castShadow>
          <boxGeometry args={[0.045, 0.62, 0.045]} />
          <meshStandardMaterial color="#d5b46f" roughness={0.28} metalness={0.68} />
        </mesh>
      ))}
      <LabelPlane
        text="记忆库"
        position={[0, 3.05, 0.64]}
        size={[1.65, 0.48]}
        color="#ffffff"
        background="rgba(17,24,39,0.78)"
        fontSize={66}
      />
    </group>
  );
}

function CommsTower({
  directPointerEnabled,
  online,
  onOpen,
}: {
  directPointerEnabled: boolean;
  online: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const color = online ? "#22c55e" : "#f59e0b";
  return (
    <group
      position={[-14.15, 0.04, 6.35]}
      rotation={[0, Math.PI / 2 - 0.2, 0]}
      userData={{
        aimashiHeldItem: "tool",
        aimashiInteract: onOpen,
        aimashiInteractionProfile: {
          kind: "tool",
          action: "hold_one_hand",
          heldItem: "tool",
          label: "通讯中心",
          hand: "right",
        },
      }}
      onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
      onPointerOver={() => setCursor("pointer", directPointerEnabled)}
      onPointerOut={() => setCursor("")}
    >
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <cylinderGeometry args={[1.02, 1.28, 0.18, 32]} />
        <meshStandardMaterial color="#303844" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 2.5, 12]} />
        <meshStandardMaterial color="#303844" roughness={0.45} metalness={0.3} />
      </mesh>
      {[0.82, 1.42, 2.02].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42 + y * 0.2, 0.018, 8, 48]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.45}
            transparent
            opacity={0.72}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      <LabelPlane
        text="通讯中心"
        position={[0, 2.98, 0]}
        size={[1.78, 0.36]}
        color="#ffffff"
        background="rgba(17,24,39,0.78)"
        fontSize={62}
      />
      <LabelPlane
        text={online ? "已在线" : "待配置"}
        position={[0, 2.62, 0]}
        size={[1.2, 0.3]}
        color={color}
        background="rgba(17,24,39,0.78)"
        fontSize={54}
      />
    </group>
  );
}

function GymEquipment({
  directPointerEnabled,
  onOpen,
}: {
  directPointerEnabled: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const [centerX, , centerZ] = useMemo(
    () =>
      toWorld(
        (GYM_ROOM.minX + GYM_ROOM.maxX) / 2,
        (GYM_ROOM.minY + GYM_ROOM.maxY) / 2,
      ),
    [],
  );
  const interactData = useMemo(
    () => ({
      aimashiHeldItem: "tool",
      aimashiInteract: onOpen,
      aimashiInteractionProfile: {
        kind: "tool",
        action: "hold_one_hand",
        heldItem: "tool",
        label: "健身器材",
        hand: "right",
      },
    }),
    [onOpen],
  );

  return (
    <group>
      <LabelPlane
        text="技能训练区"
        position={[centerX - 0.05, 2.45, centerZ - 1.82]}
        size={[2.05, 0.42]}
        color="#ffffff"
        background="rgba(17,24,39,0.76)"
        fontSize={64}
      />

      <group
        position={[centerX + 2.4, 0.08, centerZ - 1.05]}
        rotation={[0, Math.PI / 2, 0]}
        userData={interactData}
        onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
        onPointerOver={() => setCursor("pointer", directPointerEnabled)}
        onPointerOut={() => setCursor("")}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.86, 0.16, 1.72]} />
          <meshStandardMaterial color="#1f2937" roughness={0.62} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.105, 0]} receiveShadow>
          <boxGeometry args={[0.66, 0.035, 1.38]} />
          <meshStandardMaterial color="#111827" roughness={0.5} />
        </mesh>
        {[-0.38, 0.38].map((x) => (
          <mesh key={`tread-rail-${x}`} position={[x, 0.38, -0.52]} castShadow>
            <boxGeometry args={[0.035, 0.72, 0.06]} />
            <meshStandardMaterial color="#374151" roughness={0.38} metalness={0.28} />
          </mesh>
        ))}
        <mesh position={[0, 0.72, -0.82]} castShadow>
          <boxGeometry args={[0.72, 0.34, 0.08]} />
          <meshStandardMaterial
            color="#0f5f9e"
            emissive="#052f4f"
            emissiveIntensity={0.28}
            roughness={0.36}
          />
        </mesh>
      </group>

      <group
        position={[centerX + 0.3, 0.12, centerZ + 0.1]}
        rotation={[0, 0.18, 0]}
        userData={interactData}
        onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
        onPointerOver={() => setCursor("pointer", directPointerEnabled)}
        onPointerOut={() => setCursor("")}
      >
        <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.42, 0.18, 0.42]} />
          <meshStandardMaterial color="#263548" roughness={0.48} metalness={0.08} />
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={`bench-leg-${x}`} position={[x, 0.12, 0]} castShadow>
            <boxGeometry args={[0.07, 0.24, 0.48]} />
            <meshStandardMaterial color="#111827" roughness={0.42} metalness={0.32} />
          </mesh>
        ))}
        {[-0.82, 0.82].map((x) => (
          <mesh key={`bench-rack-${x}`} position={[x, 0.68, -0.35]} castShadow>
            <boxGeometry args={[0.07, 0.98, 0.07]} />
            <meshStandardMaterial color="#111827" roughness={0.38} metalness={0.36} />
          </mesh>
        ))}
        <mesh position={[0, 1.1, -0.35]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 2.2, 12]} />
          <meshStandardMaterial color="#c8d0d6" roughness={0.28} metalness={0.62} />
        </mesh>
        {[-1.18, 1.18].map((x) => (
          <mesh
            key={`barbell-plate-${x}`}
            position={[x, 1.1, -0.35]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.18, 0.18, 0.08, 24]} />
            <meshStandardMaterial color="#111827" roughness={0.42} metalness={0.18} />
          </mesh>
        ))}
      </group>

      <group
        position={[centerX - 2.3, 0.08, centerZ - 1.2]}
        rotation={[0, -0.08, 0]}
        userData={interactData}
        onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
        onPointerOver={() => setCursor("pointer", directPointerEnabled)}
        onPointerOut={() => setCursor("")}
      >
        <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.05, 0.1, 0.32]} />
          <meshStandardMaterial color="#111827" roughness={0.42} metalness={0.32} />
        </mesh>
        {[-0.9, 0.9].map((x) => (
          <mesh key={`rack-leg-${x}`} position={[x, 0.2, 0]} castShadow>
            <boxGeometry args={[0.08, 0.4, 0.24]} />
            <meshStandardMaterial color="#111827" roughness={0.45} metalness={0.28} />
          </mesh>
        ))}
        {Array.from({ length: 6 }).map((_, index) => {
          const x = -0.78 + index * 0.31;
          return (
            <group key={`dumbbell-${index}`} position={[x, 0.49, 0.02]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.035, 0.035, 0.2, 10]} />
                <meshStandardMaterial color="#c8d0d6" roughness={0.3} metalness={0.58} />
              </mesh>
              {[-0.13, 0.13].map((dx) => (
                <mesh
                  key={dx}
                  position={[dx, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.08, 0.08, 0.07, 12]} />
                  <meshStandardMaterial color="#111827" roughness={0.45} />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>

      <group
        position={[centerX + 2.1, 0.1, centerZ + 1.35]}
        rotation={[0, -0.45, 0]}
        userData={interactData}
        onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
        onPointerOver={() => setCursor("pointer", directPointerEnabled)}
        onPointerOut={() => setCursor("")}
      >
        <mesh position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.86, 0.1, 0.38]} />
          <meshStandardMaterial color="#111827" roughness={0.45} metalness={0.24} />
        </mesh>
        <mesh position={[0.12, 0.62, 0]} castShadow>
          <boxGeometry args={[0.42, 0.16, 0.38]} />
          <meshStandardMaterial color="#263548" roughness={0.48} />
        </mesh>
        <mesh position={[-0.36, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.32, 0.035, 10, 32]} />
          <meshStandardMaterial color="#111827" roughness={0.42} metalness={0.18} />
        </mesh>
        <mesh position={[0.46, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.18, 0.03, 10, 32]} />
          <meshStandardMaterial color="#111827" roughness={0.42} metalness={0.18} />
        </mesh>
        <mesh position={[0.34, 1.0, 0]} castShadow>
          <boxGeometry args={[0.48, 0.08, 0.05]} />
          <meshStandardMaterial color="#c8d0d6" roughness={0.28} metalness={0.58} />
        </mesh>
      </group>
    </group>
  );
}

function ToolRoomCabinet({
  directPointerEnabled,
  onOpen,
}: {
  directPointerEnabled: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const [centerX, , centerZ] = useMemo(
    () =>
      toWorld(
        (TOOL_ROOM.minX + TOOL_ROOM.maxX) / 2,
        (TOOL_ROOM.minY + TOOL_ROOM.maxY) / 2,
      ),
    [],
  );
  const interactData = useMemo(
    () => ({
      aimashiHeldItem: "tool",
      aimashiInteract: onOpen,
      aimashiInteractionProfile: {
        kind: "tool",
        action: "hold_one_hand",
        heldItem: "tool",
        label: "工具柜",
        hand: "right",
      },
    }),
    [onOpen],
  );
  const toolColors = ["#2563eb", "#f59e0b", "#0f766e", "#7c3aed"];

  return (
    <group>
      <LabelPlane
        text="工具仓库"
        position={[centerX + 0.1, 2.42, centerZ + 0.9]}
        size={[1.68, 0.36]}
        color="#ffffff"
        background="rgba(17,24,39,0.78)"
        fontSize={62}
      />
      <group
        position={[centerX + 0.5, 0.08, centerZ + 0.86]}
        rotation={[0, Math.PI, 0]}
        userData={interactData}
        onClick={(e) => stopClick(e, onOpen, directPointerEnabled)}
        onPointerOver={() => setCursor("pointer", directPointerEnabled)}
        onPointerOut={() => setCursor("")}
      >
        <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 2.1, 0.34]} />
          <meshStandardMaterial color="#263548" roughness={0.58} metalness={0.08} />
        </mesh>
        <mesh position={[0, 1.12, 0.2]} receiveShadow>
          <boxGeometry args={[3.46, 1.74, 0.06]} />
          <meshStandardMaterial color="#111827" roughness={0.62} />
        </mesh>
        {[-1.72, 0, 1.72].map((x) => (
          <mesh key={`tool-upright-${x}`} position={[x, 1.12, 0.28]} castShadow>
            <boxGeometry args={[0.06, 1.9, 0.12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.34} metalness={0.42} />
          </mesh>
        ))}
        {[0.48, 1.08, 1.68].map((y) => (
          <mesh key={`tool-shelf-${y}`} position={[0, y, 0.3]} castShadow>
            <boxGeometry args={[3.58, 0.06, 0.3]} />
            <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.22} />
          </mesh>
        ))}
        {Array.from({ length: 10 }).map((_, index) => {
          const row = Math.floor(index / 5);
          const col = index % 5;
          return (
            <mesh
              key={`tool-case-${index}`}
              position={[-1.34 + col * 0.67, 0.34 + row * 0.62, 0.54]}
              castShadow
            >
              <boxGeometry args={[0.42, 0.26, 0.32]} />
              <meshStandardMaterial
                color={toolColors[index % toolColors.length]}
                roughness={0.5}
                metalness={0.04}
              />
            </mesh>
          );
        })}
        {[-1.15, -0.38, 0.38, 1.15].map((x, index) => (
          <group key={`hanging-tool-${index}`} position={[x, 1.74, 0.55]}>
            <mesh position={[0, 0.12, 0]} castShadow>
              <boxGeometry args={[0.08, 0.44, 0.08]} />
              <meshStandardMaterial color="#d1d5db" roughness={0.28} metalness={0.58} />
            </mesh>
            <mesh position={[0, -0.16, 0]} castShadow>
              <boxGeometry args={[0.2, 0.18, 0.1]} />
              <meshStandardMaterial
                color={toolColors[index % toolColors.length]}
                roughness={0.42}
                metalness={0.08}
              />
            </mesh>
          </group>
        ))}
        <mesh position={[-1.42, 0.08, 0.62]} castShadow receiveShadow>
          <boxGeometry args={[0.92, 0.18, 0.56]} />
          <meshStandardMaterial color="#0f5f9e" roughness={0.46} metalness={0.12} />
        </mesh>
        <mesh position={[-1.42, 0.23, 0.62]} castShadow>
          <boxGeometry args={[0.72, 0.09, 0.12]} />
          <meshStandardMaterial color="#f6c343" roughness={0.32} metalness={0.42} />
        </mesh>
        <LabelPlane
          text="工具柜"
          position={[0, 2.3, 0.38]}
          size={[1.18, 0.3]}
          color="#f8fafc"
          background="rgba(15,23,42,0.84)"
          fontSize={58}
        />
        <mesh position={[0, 1.1, 0.68]}>
          <boxGeometry args={[4.15, 2.42, 0.72]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export function SceneInteractables({
  currentModel,
  currentProvider,
  directPointerEnabled,
  gatewayOnline,
  onOpenView,
  onStartChat,
  onToggleEngine,
}: SceneInteractablesProps): React.JSX.Element {
  void onStartChat;
  return (
    <group>
      <TaskWhiteboard
        directPointerEnabled={directPointerEnabled}
        onOpen={() => onOpenView("kanban")}
      />
      <BrainEngine
        currentModel={currentModel}
        currentProvider={currentProvider}
        directPointerEnabled={directPointerEnabled}
        onOpen={onToggleEngine}
      />
      <MemoryLibrary
        directPointerEnabled={directPointerEnabled}
        onOpen={() => onOpenView("memory")}
      />
      <CommsTower
        directPointerEnabled={directPointerEnabled}
        online={gatewayOnline}
        onOpen={() => onOpenView("gateway")}
      />
      <GymEquipment
        directPointerEnabled={directPointerEnabled}
        onOpen={() => onOpenView("skills")}
      />
      <ToolRoomCabinet
        directPointerEnabled={directPointerEnabled}
        onOpen={() => onOpenView("tools")}
      />
    </group>
  );
}
