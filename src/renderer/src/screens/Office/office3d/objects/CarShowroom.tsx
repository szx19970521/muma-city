import { Suspense, memo, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { VehicleModel, car1GlbUrl, car2GlbUrl } from "./Traffic";
import {
  SHOWROOM_W,
  SHOWROOM_D,
  SHOWROOM_X,
  SHOWROOM_Z,
  SHOWROOM_WALL_H,
  SHOWROOM_WALL_T,
} from "../core/cityPlan";

const SHOWROOM_PALETTE = {
  floor: "#d8d7d0",
  wall: "#d4d5d1",
  trim: "#9fa6ad",
  darkTrim: "#17202c",
  pedestal: "#c6c8c3",
  sign: "#1b2533",
  brand: "#f97316",
};

/** Hero car slowly spinning on the display pedestal. */
function RotatingShowcaseCar({
  position,
  url,
  tint,
}: {
  position: [number, number, number];
  url: string;
  tint: string;
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += Math.min(delta, 0.05) * 0.45;
    }
  });
  return (
    <group
      ref={groupRef}
      position={position}
      userData={{ aimashiCollisionRadius: 1.15 }}
    >
      <VehicleModel url={url} tint={tint} targetLen={2.6} />
    </group>
  );
}

interface DisplayCar {
  pos: [number, number, number];
  rotY: number;
  url: string;
  tint: string;
}

const DISPLAY_CARS: DisplayCar[] = [
  {
    pos: [-4, 0, -7],
    rotY: Math.PI / 2 - 0.3,
    url: car1GlbUrl,
    tint: "#b03a2e",
  },
  {
    pos: [-4, 0, -2.5],
    rotY: Math.PI / 2 + 0.25,
    url: car2GlbUrl,
    tint: "#1f618d",
  },
  {
    pos: [-4, 0, 2.5],
    rotY: Math.PI / 2 - 0.25,
    url: car1GlbUrl,
    tint: "#e8e8e8",
  },
  {
    pos: [-4, 0, 7],
    rotY: Math.PI / 2 + 0.3,
    url: car2GlbUrl,
    tint: "#39414f",
  },
  { pos: [2.5, 0, -6.5], rotY: Math.PI / 2, url: car2GlbUrl, tint: "#ca6f1e" },
  { pos: [2.5, 0, 6.5], rotY: Math.PI / 2, url: car1GlbUrl, tint: "#239b56" },
];

// Storefront pillars every 4 units; the middle bay is the open entrance.
const PILLAR_ZS = [-10, -6, -2, 2, 6, 10];
const GLASS_BAYS = [0, 1, 3, 4]; // bay 2 (centre) stays open

function createShowroomSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#101827");
  bg.addColorStop(0.5, "#1f2937");
  bg.addColorStop(1, "#0b1220");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const trim = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  trim.addColorStop(0, "#f59e0b");
  trim.addColorStop(0.42, "#fff4bf");
  trim.addColorStop(1, "#f97316");
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, canvas.width, 16);
  ctx.fillRect(0, canvas.height - 16, canvas.width, 16);

  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  ctx.save();
  ctx.translate(190, canvas.height / 2);
  ctx.fillStyle = SHOWROOM_PALETTE.brand;
  ctx.beginPath();
  ctx.ellipse(0, 0, 94, 54, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.moveTo(-62, 8);
  ctx.lineTo(-24, -28);
  ctx.lineTo(58, -24);
  ctx.lineTo(28, 2);
  ctx.lineTo(64, 27);
  ctx.lineTo(-10, 26);
  ctx.lineTo(-28, 45);
  ctx.lineTo(-48, 34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = "rgba(255, 201, 95, 0.72)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#fff7d6";
  ctx.font = "bold 92px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("\u5c0f\u9a6c\u8f66\u884c", 330, canvas.height / 2 - 18);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#d5e4f7";
  ctx.font = "30px sans-serif";
  ctx.fillText("Pony Auto Gallery", 336, canvas.height / 2 + 56);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function AutoShowroomGlassDoor({
  halfW,
  wallT,
  glassH,
  worldPosition,
}: {
  halfW: number;
  wallT: number;
  glassH: number;
  worldPosition: [number, number, number];
}): React.JSX.Element {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const doorX = halfW + wallT / 2 + 0.035;
  const panelW = 1.58;
  const baseOffset = panelW / 2;
  const slide = 1.18;

  useFrame((_, delta) => {
    const worldDoorX = worldPosition[0] + doorX;
    const worldDoorZ = worldPosition[2];
    const playerPosition = camera.userData.aimashiPlayerPosition as
      | { x: number; y: number; z: number }
      | undefined;
    const sensorX = playerPosition?.x ?? camera.position.x;
    const sensorZ = playerPosition?.z ?? camera.position.z;
    const near = Math.hypot(sensorX - worldDoorX, sensorZ - worldDoorZ) < 4.2;
    const target = near ? slide : 0;
    const speed = 1 - Math.exp(-delta * 7.5);
    if (leftRef.current) {
      leftRef.current.position.z = THREE.MathUtils.lerp(
        leftRef.current.position.z,
        -baseOffset - target,
        speed,
      );
    }
    if (rightRef.current) {
      rightRef.current.position.z = THREE.MathUtils.lerp(
        rightRef.current.position.z,
        baseOffset + target,
        speed,
      );
    }
  });

  const pane = (
    <>
      <planeGeometry args={[panelW, glassH]} />
      <meshStandardMaterial
        color="#cfe8f5"
        roughness={0.04}
        metalness={0.22}
        transparent
        opacity={0.38}
        depthWrite={false}
        envMapIntensity={1.4}
        side={THREE.DoubleSide}
      />
    </>
  );

  return (
    <group position={[doorX, 0, 0]}>
      <group ref={leftRef} position={[0, 0, -baseOffset]}>
        <mesh position={[0, 0.28 + glassH / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          {pane}
        </mesh>
        <mesh position={[0.02, 1.25, panelW / 2 - 0.15]}>
          <boxGeometry args={[0.05, 0.95, 0.06]} />
          <meshStandardMaterial color="#1a1d22" roughness={0.38} metalness={0.35} />
        </mesh>
      </group>
      <group ref={rightRef} position={[0, 0, baseOffset]}>
        <mesh position={[0, 0.28 + glassH / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          {pane}
        </mesh>
        <mesh position={[0.02, 1.25, -panelW / 2 + 0.15]}>
          <boxGeometry args={[0.05, 0.95, 0.06]} />
          <meshStandardMaterial color="#1a1d22" roughness={0.38} metalness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Car showroom on the west block: glass storefront facing the office, display
 * cars inside (reusing the traffic vehicle models/tints) and a hero car
 * rotating on a pedestal.
 */
export const CarShowroom = memo(function CarShowroom({
  position = [SHOWROOM_X, 0, SHOWROOM_Z],
}: {
  position?: [number, number, number];
} = {}): React.JSX.Element {
  const halfW = SHOWROOM_W / 2;
  const halfD = SHOWROOM_D / 2;
  const wallH = SHOWROOM_WALL_H;
  const wallT = SHOWROOM_WALL_T;
  const plinthH = 0.18;
  const bandH = 0.54;
  const glassH = wallH - plinthH - bandH;
  const signTexture = useMemo(() => createShowroomSignTexture(), []);
  const signX = halfW + 1.36;
  const signY = wallH + 0.62;

  return (
    <group position={position}>
      {/* Polished display floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[SHOWROOM_W, SHOWROOM_D]} />
        <meshStandardMaterial
          color={SHOWROOM_PALETTE.floor}
          roughness={0.35}
          metalness={0.05}
          envMapIntensity={0.9}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {/* Back (west) wall */}
      <mesh position={[-halfW, wallH / 2, 0]}>
        <boxGeometry args={[wallT, wallH, SHOWROOM_D]} />
        <meshStandardMaterial color={SHOWROOM_PALETTE.wall} />
      </mesh>
      {/* North / south walls */}
      <mesh position={[0, wallH / 2, -halfD]}>
        <boxGeometry args={[SHOWROOM_W, wallH, wallT]} />
        <meshStandardMaterial color={SHOWROOM_PALETTE.wall} />
      </mesh>
      <mesh position={[0, wallH / 2, halfD]}>
        <boxGeometry args={[SHOWROOM_W, wallH, wallT]} />
        <meshStandardMaterial color={SHOWROOM_PALETTE.wall} />
      </mesh>
      {/* Sealed roof so the showroom reads as a complete building. */}
      <mesh position={[0, wallH + 0.11, 0]} receiveShadow>
        <boxGeometry args={[SHOWROOM_W + 0.7, 0.22, SHOWROOM_D + 0.7]} />
        <meshStandardMaterial color="#d3d8df" roughness={0.58} metalness={0.03} />
      </mesh>
      <mesh position={[halfW + 0.2, wallH + 0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.36, SHOWROOM_D + 0.9]} />
        <meshStandardMaterial color={SHOWROOM_PALETTE.darkTrim} roughness={0.34} metalness={0.25} />
      </mesh>
      <mesh position={[halfW + 0.75, wallH + 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.05, 0.16, SHOWROOM_D + 1.15]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.22} metalness={0.16} />
      </mesh>
      {/* Glass storefront (east, facing the office): plinth + top band +
          pillars, transparent panes so the cars show through. */}
      <mesh position={[halfW, plinthH / 2, 0]}>
        <boxGeometry args={[wallT, plinthH, SHOWROOM_D]} />
        <meshStandardMaterial color={SHOWROOM_PALETTE.trim} />
      </mesh>
      <mesh position={[halfW, wallH - bandH / 2, 0]}>
        <boxGeometry args={[wallT, bandH, SHOWROOM_D]} />
        <meshStandardMaterial color={SHOWROOM_PALETTE.darkTrim} roughness={0.36} metalness={0.2} />
      </mesh>
      {PILLAR_ZS.map((pz) => (
        <mesh key={`pillar-${pz}`} position={[halfW, wallH / 2, pz]}>
          <boxGeometry args={[wallT, wallH, 0.35]} />
          <meshStandardMaterial color={SHOWROOM_PALETTE.darkTrim} roughness={0.36} metalness={0.22} />
        </mesh>
      ))}
      {GLASS_BAYS.map((bay) => {
        const z0 = PILLAR_ZS[bay];
        const z1 = PILLAR_ZS[bay + 1];
        return (
          <mesh
            key={`glass-${bay}`}
            position={[halfW, plinthH + glassH / 2, (z0 + z1) / 2]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[z1 - z0 - 0.4, glassH]} />
            <meshStandardMaterial
              color="#cfe2ee"
              roughness={0.05}
              metalness={0.3}
              transparent
              opacity={0.22}
              depthWrite={false}
              envMapIntensity={1.2}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      <AutoShowroomGlassDoor
        halfW={halfW}
        wallT={wallT}
        glassH={glassH}
        worldPosition={position}
      />
      {/* Canvas sign avoids packaged file:// font fallback fetches for Chinese glyphs. */}
      <mesh position={[signX, signY, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={8}>
        <planeGeometry args={[7.55, 1.55]} />
        <meshBasicMaterial
          color="#0b1120"
          transparent
          opacity={0.97}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh position={[signX + 0.04, signY, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={9}>
        <planeGeometry args={[7.25, 1.28]} />
        <meshBasicMaterial
          map={signTexture}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      {[-5.9, -2.0, 2.0, 5.9].map((pz) => (
        <mesh
          key={`display-light-${pz}`}
          position={[halfW - 2.4, wallH - 0.22, pz]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <boxGeometry args={[0.08, 0.08, 1.5]} />
          <meshStandardMaterial
            color="#fff7dc"
            emissive="#ffe8a3"
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Display pedestal + rotating hero car near the storefront */}
      <mesh position={[1.5, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.0, 2.2, 0.16, 24]} />
        <meshStandardMaterial
          color={SHOWROOM_PALETTE.pedestal}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
      <Suspense fallback={null}>
        <RotatingShowcaseCar
          position={[1.5, 0.16, 0]}
          url={car1GlbUrl}
          tint="#d4ac0d"
        />
        {DISPLAY_CARS.map((c, i) => (
          <group
            key={`sc-${i}`}
            position={c.pos}
            rotation={[0, c.rotY, 0]}
            userData={{ aimashiCollisionRadius: 1.05 }}
          >
            <VehicleModel url={c.url} tint={c.tint} targetLen={2.3} />
          </group>
        ))}
      </Suspense>
      {/* Entrance plants */}
      {([-3.2, 3.2] as number[]).map((pz) => (
        <group
          key={`splant-${pz}`}
          position={[halfW + 0.8, 0, pz]}
          userData={{ aimashiCollisionRadius: 0.38 }}
        >
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.25, 0.7, 8]} />
            <meshStandardMaterial color="#ddd" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.0, 0]} castShadow>
            <sphereGeometry args={[0.45, 8, 8]} />
            <meshStandardMaterial color="#3a7c47" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
