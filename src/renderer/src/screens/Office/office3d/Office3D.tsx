import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { configureTextBuilder } from "troika-three-text";
import * as THREE from "three";
import { SceneEnvironment } from "./objects/SceneEnvironment";
import { CityBackdrop, DistantSkyline } from "./objects/CityBackdrop";
import { TrafficLayer } from "./objects/Traffic";
import { BankSection, ConnectingStreet } from "./objects/Bank";
import { CarShowroom } from "./objects/CarShowroom";
import {
  Room,
  InteriorWalls,
  GlassWalls,
  CeoOfficeExtras,
} from "./objects/OfficeShell";
import { Workstations, FurniturePieces } from "./objects/furniture";
import { AgentsLayer } from "./objects/AgentsLayer";
import { SceneInteractables } from "./objects/SceneInteractables";
import {
  buildWorkstations,
  REST_FURNITURE,
  EXECUTIVE_DECOR,
  MANAGER_OFFICE_FURNITURE,
} from "./layout";
import { getWorldPalette } from "./core/palette";
import { BANK_X, BANK_Z, SHOWROOM_X, SHOWROOM_Z } from "./core/cityPlan";
import type { OfficeAgent, OfficeAgentTask, RenderAgent } from "./core/types";
import { buildWorldSceneState } from "./core/worldState";
import { FirstPersonSystem } from "./firstPerson/FirstPersonSystem";
import type {
  FirstPersonHudState,
  HeldItemKind,
} from "./firstPerson/types";
import officeFontUrl from "../../../assets/fonts/Manrope-Medium.ttf";
import type { AgentBehaviorIntent } from "./core/agentBehavior";

// drei's <Text> (agent nameplates / speech bubbles, via troika) defaults to two
// behaviours the renderer's strict CSP (`script-src`/`default-src 'self'`)
// blocks: spawning a blob-backed Web Worker, and fetching its default font from
// a CDN. Disable the worker (typeset on the main thread) and point troika at
// our locally-bundled Manrope so labels render fully offline without loosening
// the app's Content-Security-Policy.
configureTextBuilder({ useWorker: false, defaultFontURL: officeFontUrl });

// Default camera look-at, hoisted to a stable reference. drei's OrbitControls
// re-applies `target` whenever the prop identity changes, so a fresh tuple each
// render would reset the focus point and wipe the user's pan/zoom on every
// unrelated re-render (e.g. an agent status poll). (Value is the office's north
// side — was BANK_Z / 2 when the bank sat north, pinned after it moved east.)
const CAMERA_TARGET: [number, number, number] = [0, 0, -14.6];
type CameraMode = "firstPerson" | "orbit";

/**
 * The native, in-renderer 3D office. Replaces the old webview that pointed at a
 * separately-cloned hermes-office dev server. Each agent corresponds to a
 * desktop profile.
 */
export default function Office3D({
  agents,
  selectedId,
  onSelectAgent,
  currentModel,
  currentProvider,
  gatewayOnline,
  onOpenView,
  onStartChat,
  onAgentInteract,
  onOpenAgentTask,
  agentTaskById,
  agentBehaviorById,
  onToggleEngine,
  onSceneMissed,
  cameraMode,
  firstPersonInputEnabled = true,
  firstPersonSelectedItemRequest,
  onFirstPersonHudChange,
  devMode = false,
  onDevLog,
  onReady,
}: {
  agents: OfficeAgent[];
  selectedId: string | null;
  onSelectAgent: (id: string | null) => void;
  currentModel: string;
  currentProvider: string;
  gatewayOnline: boolean;
  onOpenView: (
    view:
      | "chat"
      | "models"
      | "kanban"
      | "memory"
      | "skills"
      | "tools"
      | "schedules"
      | "gateway"
      | "settings",
  ) => void;
  onStartChat: () => void;
  onAgentInteract: (id: string) => void;
  onOpenAgentTask: (id: string) => void;
  agentTaskById: Record<string, OfficeAgentTask>;
  agentBehaviorById?: Record<string, AgentBehaviorIntent>;
  onToggleEngine: () => void;
  onSceneMissed?: () => void;
  cameraMode: CameraMode;
  firstPersonInputEnabled?: boolean;
  firstPersonSelectedItemRequest?: { item: HeldItemKind; tick: number };
  onFirstPersonHudChange?: (patch: Partial<FirstPersonHudState>) => void;
  devMode?: boolean;
  onDevLog?: (msg: string) => void;
  onReady?: () => void;
}): React.JSX.Element {
  // Clicking the selected agent again clears the selection. Memoized so agent
  // status polling (which re-renders Office3D with a new `agents` array but an
  // unchanged selection) doesn't hand AgentsLayer/AgentModel a fresh callback
  // and defeat their React.memo.
  const handleSelect = useCallback(
    (id: string): void => {
      onSelectAgent(id === selectedId ? null : id);
    },
    [selectedId, onSelectAgent],
  );

  const handlePointerMissed = useCallback((): void => {
    onSelectAgent(null);
    onSceneMissed?.();
  }, [onSelectAgent, onSceneMissed]);

  // The building-mover is a dev-only authoring aid. `import.meta.env.DEV` is a
  // build-time literal (Vite replaces it: `true` in `electron-vite dev`,
  // `false` in production builds). Using it *inline* at each JSX site below lets
  // esbuild constant-fold and dead-code-eliminate every dev-only branch — the
  // button, handlers, ground-plane catcher and helpers are all dropped from the
  // production bundle, so they can't run or cost anything for end users.

  // ── Developer building-mover ──────────────────────────────────────────────
  // When devMode is on: click a building to "pick it up" (logs it + its current
  // position), then click empty ground to drop it there (logs a paste-ready
  // code line and moves it live so spacing is visible). Landmarks (bank /
  // showroom) map to constants in cityPlan.ts; backdrop buildings map to an
  // entry in BACKDROP_OVERRIDES (CityBackdrop.tsx).
  type DevSel = {
    id: string;
    label: string;
    kind: "landmark" | "backdrop";
    base: [number, number, number];
    hint: string;
  };
  const LANDMARKS: Record<"bank" | "showroom", DevSel> = {
    bank: {
      id: "bank",
      label: "Bank",
      kind: "landmark",
      base: [BANK_X, 0, BANK_Z],
      hint: "BANK_X / BANK_Z in cityPlan.ts",
    },
    showroom: {
      id: "showroom",
      label: "CarShowroom",
      kind: "landmark",
      base: [SHOWROOM_X, 0, SHOWROOM_Z],
      hint: "SHOWROOM_X / SHOWROOM_Z in cityPlan.ts",
    },
  };
  const [devSel, setDevSel] = useState<DevSel | null>(null);
  const [devPos, setDevPos] = useState<
    Record<string, [number, number, number]>
  >({});

  const posOf = (
    id: string,
    base: [number, number, number],
  ): [number, number, number] => devPos[id] ?? base;

  // Landmark click handler (bank / showroom groups). The select logic is
  // inlined here (and in pickBackdrop) rather than shared, so that when the
  // production build strips these dev-only handlers there is no lingering
  // shared helper left referenced in the bundle.
  const pickLandmark =
    (meta: DevSel) =>
    (e: ThreeEvent<MouseEvent>): void => {
      if (!devMode) return;
      e.stopPropagation();
      const p = posOf(meta.id, meta.base);
      setDevSel(meta);
      const msg = `🏢 SELECTED ${meta.label} (${meta.id}) — current position [${p[0].toFixed(2)}, ${p[2].toFixed(2)}]. Now click empty ground to set its new spot.`;
      console.log(msg);
      onDevLog?.(msg);
    };

  // Backdrop building click handler (passed down into CityBackdrop). A plain
  // arrow (not useCallback) so production DCE can drop it entirely — its only
  // call site is gated by `import.meta.env.DEV` and folds to `undefined` in
  // prod. CityBackdrop is memoized, but in prod it always receives a stable
  // `undefined` here, so referential stability only matters in dev (where the
  // extra re-render is harmless).
  const pickBackdrop = (b: {
    id: string;
    label: string;
    x: number;
    z: number;
  }): void => {
    const meta: DevSel = {
      id: b.id,
      label: b.label,
      kind: "backdrop",
      base: [b.x, 0, b.z],
      hint: "BACKDROP_OVERRIDES in CityBackdrop.tsx",
    };
    setDevSel(meta);
    const msg = `🏢 SELECTED ${meta.label} (${meta.id}) — current position [${b.x.toFixed(2)}, ${b.z.toFixed(2)}]. Now click empty ground to set its new spot.`;
    console.log(msg);
    onDevLog?.(msg);
  };

  const dropAt = (e: ThreeEvent<MouseEvent>): void => {
    if (!devMode || !devSel) return;
    e.stopPropagation();
    const { x, z } = e.point;
    const rx = Math.round(x * 100) / 100;
    const rz = Math.round(z * 100) / 100;
    setDevPos((prev) => ({ ...prev, [devSel.id]: [rx, 0, rz] }));
    // One-shot: drop ends this building's selection so the next ground click
    // doesn't keep dragging it around. Click a building again to move it more.
    const msg =
      devSel.kind === "landmark"
        ? `📍 MOVE ${devSel.label} → position={[${rx}, 0, ${rz}]}  (update ${devSel.hint}). Selection cleared — click another building.`
        : `📍 MOVE ${devSel.label} → "${devSel.id}": [${rx}, ${rz}],  (paste into ${devSel.hint}). Selection cleared — click another building.`;
    setDevSel(null);
    console.log(msg);
    onDevLog?.(msg);
  };

  // Keep the camera's focus point inside the city so panning (or
  // zoom-to-cursor) can never strand the user in empty void off the map.
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const clampControlsTarget = (): void => {
    const controls = controlsRef.current;
    if (!controls) return;
    const t = controls.target;
    const x = THREE.MathUtils.clamp(t.x, -90, 90);
    const y = THREE.MathUtils.clamp(t.y, 0, 12);
    const z = THREE.MathUtils.clamp(t.z, -90, 90);
    if (x !== t.x || y !== t.y || z !== t.z) t.set(x, y, z);
  };

  // The CEO (if any) gets a separate executive desk; everyone else grids up.
  const ceoId = useMemo(
    () => agents.find((a) => a.position === "ceo")?.id ?? null,
    [agents],
  );

  // One desk per agent, assigned in profile order.
  const workstations = useMemo(
    () =>
      buildWorkstations(
        agents.map((a) => a.id),
        ceoId,
      ),
    [agents, ceoId],
  );
  const [deskSeatedAgentIds, setDeskSeatedAgentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const liveAgentsRef = useRef<RenderAgent[]>([]);
  const handleDeskSeatedAgentsChange = useCallback((ids: Set<string>): void => {
    setDeskSeatedAgentIds(new Set(ids));
  }, []);

  const [worldNowMs, setWorldNowMs] = useState(() => Date.now());

  useEffect(() => {
    const sync = (): void => setWorldNowMs(Date.now());
    sync();
    const timer = window.setInterval(sync, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const world = useMemo(() => buildWorldSceneState(worldNowMs), [worldNowMs]);
  const palette = useMemo(() => getWorldPalette(world), [world]);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      // near=1 (instead of the 0.1 default) gives the depth buffer ~10× more
      // precision at distance — without it the road decals z-fight the ground
      // plane into flickering stripes when viewed from far away.
      camera={{ position: [0, 38, 48], fov: 50, near: 1, far: 1000 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={() => {
        window.requestAnimationFrame(() => onReady?.());
      }}
      onPointerMissed={handlePointerMissed}
      className="aimashi-office-canvas"
      style={{ width: "100%", height: "100%" }}
    >
      <SceneEnvironment palette={palette} world={world} />
      <DistantSkyline />
      <CityBackdrop
        world={world}
        devMode={import.meta.env.DEV && devMode}
        moved={import.meta.env.DEV && devMode ? devPos : undefined}
        onPick={import.meta.env.DEV && devMode ? pickBackdrop : undefined}
      />
      <Suspense fallback={null}>
        <TrafficLayer world={world} />
      </Suspense>
      <ConnectingStreet />
      <Room palette={palette} world={world} liveAgentsRef={liveAgentsRef} />
      <InteriorWalls palette={palette} />
      <GlassWalls liveAgentsRef={liveAgentsRef} />
      <Suspense fallback={null}>
        <CeoOfficeExtras />
      </Suspense>
      {import.meta.env.DEV && devMode ? (
        <>
          <group onClick={pickLandmark(LANDMARKS.bank)}>
            <BankSection position={posOf("bank", LANDMARKS.bank.base)} />
          </group>
          <group onClick={pickLandmark(LANDMARKS.showroom)}>
            <CarShowroom
              position={posOf("showroom", LANDMARKS.showroom.base)}
            />
          </group>
          {/* Invisible ground catcher: the second click lands here (buildings
              stopPropagation on the first), giving the pick-then-drop flow. */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.05, 0]}
            onClick={dropAt}
          >
            <planeGeometry args={[600, 600]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </>
      ) : (
        <>
          <BankSection />
          <CarShowroom />
        </>
      )}
      <Suspense fallback={null}>
        <Workstations
          workstations={workstations}
          agents={agents}
          deskSeatedAgentIds={deskSeatedAgentIds}
          agentTaskById={agentTaskById}
          agentBehaviorById={agentBehaviorById}
          onOpenAgentTask={onOpenAgentTask}
        />
        <FurniturePieces pieces={REST_FURNITURE} />
        <FurniturePieces
          pieces={
            ceoId
              ? EXECUTIVE_DECOR
              : [...MANAGER_OFFICE_FURNITURE, ...EXECUTIVE_DECOR]
          }
        />
      </Suspense>
      <SceneInteractables
        currentModel={currentModel}
        currentProvider={currentProvider}
        directPointerEnabled={cameraMode !== "firstPerson"}
        gatewayOnline={gatewayOnline}
        onOpenView={onOpenView}
        onStartChat={onStartChat}
        onToggleEngine={onToggleEngine}
      />
      <AgentsLayer
        agents={agents}
        workstations={workstations}
        selectedId={selectedId}
        onSelect={handleSelect}
        onInteract={onAgentInteract}
        agentBehaviorById={agentBehaviorById}
        onDeskSeatedAgentsChange={handleDeskSeatedAgentsChange}
        liveAgentsRef={liveAgentsRef}
      />
      {cameraMode === "firstPerson" ? (
        <FirstPersonSystem
          inputEnabled={firstPersonInputEnabled}
          onSceneMissed={handlePointerMissed}
          onHudStateChange={onFirstPersonHudChange}
          selectedItemRequest={firstPersonSelectedItemRequest}
        />
      ) : (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan
          // Inertial damping: motion eases out instead of stopping dead, which
          // is most of the "controllable" feel.
          enableDamping
          dampingFactor={0.08}
          // Gentler speeds — the raw defaults feel twitchy over a city-sized
          // scene, especially zoom (multiplicative per wheel tick).
          rotateSpeed={0.75}
          panSpeed={0.9}
          zoomSpeed={0.65}
          // Map-style panning: dragging slides along the ground plane at
          // constant height, instead of moving with the screen axes.
          screenSpacePanning={false}
          // Scrolling dives toward whatever the cursor points at — point at
          // the bank or showroom and scroll to fly there.
          zoomToCursor
          minDistance={5}
          maxDistance={130}
          maxPolarAngle={Math.PI / 2.15}
          // Stable module-level reference — see CAMERA_TARGET above. A fresh
          // array here would reset the controls' target and wipe any user pan.
          target={CAMERA_TARGET}
          onChange={clampControlsTarget}
        />
      )}
    </Canvas>
  );
}
