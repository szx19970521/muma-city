import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AgentModel } from "./agents";
import { RIGGED_EMPLOYEE_URL, RIGGED_MAN_URL } from "./RiggedCharacter";
import {
  GLASS_DOOR_PANELS,
  REST_SEATS,
  TOOL_ROOM,
  type Seat,
  type Workstation,
} from "../layout";
import { CANVAS_H, CANVAS_W, SCALE, WALK_SPEED } from "../core/constants";
import {
  findOfficePath,
  isAgentCanvasPointWalkable,
} from "../core/navigationCollision";
import type {
  AgentBehaviorIntent,
  AgentBehaviorKind,
} from "../core/agentBehavior";
import type { OfficeAgent, RenderAgent } from "../core/types";

const WALK_UNITS_PER_SEC = 82;
const ARRIVE_DISTANCE = 12;
const DOOR_PAUSE_MS = 420;
const DOOR_PAUSE_RADIUS = 34;

type ControllerMode = "toTarget" | "performing";
type AgentGoalKey =
  | "desk"
  | "desk_idle"
  | "rest"
  | "idle"
  | "gym"
  | "memory"
  | "comms"
  | "tools"
  | "talk";

interface ControllerState {
  mode: ControllerMode;
  goalKey: AgentGoalKey | null;
  goalX: number | null;
  goalY: number | null;
  goalState: RenderAgent["state"] | null;
  doorPauseUntil: number;
  doorPauseKey: string | null;
}

interface BehaviorTarget {
  key: AgentGoalKey;
  x: number;
  y: number;
  facing: number;
  state: RenderAgent["state"];
  workoutStyle?: RenderAgent["workoutStyle"];
}

const GYM_TARGETS: BehaviorTarget[] = [
  {
    key: "gym",
    x: 872,
    y: 188,
    facing: Math.PI,
    state: "working_out",
    workoutStyle: "lift",
  },
  {
    key: "gym",
    x: 1048,
    y: 210,
    facing: -Math.PI / 2,
    state: "working_out",
    workoutStyle: "run",
  },
  {
    key: "gym",
    x: 990,
    y: 126,
    facing: Math.PI,
    state: "working_out",
    workoutStyle: "stretch",
  },
];

const MEMORY_TARGET: BehaviorTarget = {
  key: "memory",
  x: 1360,
  y: 310,
  facing: Math.PI,
  state: "using_memory",
};

const COMMS_TARGET: BehaviorTarget = {
  key: "comms",
  x: 118,
  y: 1256,
  facing: -Math.PI / 2,
  state: "using_comms",
};

const TOOLS_TARGET: BehaviorTarget = {
  key: "tools",
  x: TOOL_ROOM.minX + 108,
  y: (TOOL_ROOM.minY + TOOL_ROOM.maxY) / 2,
  facing: Math.PI / 2,
  state: "using_tools",
};

const DOOR_CENTERS = GLASS_DOOR_PANELS.map((door) => ({
  id: door.id,
  x: door.x + door.w / 2,
  y: door.y + door.h / 2,
}));

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function stableIndex(value: string): number {
  return Math.abs(
    value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0),
  );
}

function makeController(): ControllerState {
  return {
    mode: "toTarget",
    goalKey: null,
    goalX: null,
    goalY: null,
    goalState: null,
    doorPauseUntil: 0,
    doorPauseKey: null,
  };
}

function makeRenderAgent(agent: OfficeAgent): RenderAgent {
  const x = randomBetween(820, 1000);
  const y = 1650;
  return {
    ...agent,
    x,
    y,
    targetX: x,
    targetY: y,
    path: [],
    facing: Math.PI,
    frame: Math.floor(randomBetween(0, 240)),
    walkSpeed: WALK_SPEED,
    phaseOffset: randomBetween(0, Math.PI * 2),
    state: "standing",
  };
}

function targetFromSeat(
  key: AgentGoalKey,
  seat: Seat,
  state: RenderAgent["state"],
): BehaviorTarget {
  return { key, x: seat.x, y: seat.y, facing: seat.facing, state };
}

export const AgentsLayer = memo(function AgentsLayer({
  agents,
  workstations,
  selectedId,
  onSelect,
  onInteract,
  agentBehaviorById,
  onDeskSeatedAgentsChange,
  liveAgentsRef,
}: {
  agents: OfficeAgent[];
  workstations: Workstation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onInteract: (id: string) => void;
  agentBehaviorById?: Record<string, AgentBehaviorIntent>;
  onDeskSeatedAgentsChange?: (ids: Set<string>) => void;
  liveAgentsRef?: React.MutableRefObject<RenderAgent[]>;
}): React.JSX.Element {
  const agentsRef = useRef<RenderAgent[]>([]) as React.MutableRefObject<
    RenderAgent[]
  >;
  const lookupRef = useRef<Map<string, RenderAgent>>(new Map());
  const controllerRef = useRef<Map<string, ControllerState>>(new Map());
  const deskSeatedKeyRef = useRef("");

  const deskSeatByAgent = useMemo(() => {
    const map = new Map<string, Seat>();
    for (const w of workstations) {
      if (!w.agentId) continue;
      map.set(w.agentId, { x: w.seatX, y: w.seatY, facing: w.seatFacing });
    }
    return map;
  }, [workstations]);

  const restSeatByAgent = useMemo(() => {
    const map = new Map<string, Seat>();
    if (REST_SEATS.length > 0) {
      agents.forEach((agent, index) => {
        map.set(agent.id, REST_SEATS[index % REST_SEATS.length]);
      });
    }
    return map;
  }, [agents]);

  const resolveBehaviorTarget = (
    agent: RenderAgent,
    behavior: AgentBehaviorIntent | undefined,
  ): BehaviorTarget | null => {
    const kind: AgentBehaviorKind =
      behavior?.kind ??
      (agent.status === "working" ? "working_at_desk" : "idle_patrol");
    const desk = deskSeatByAgent.get(agent.id);
    const rest = restSeatByAgent.get(agent.id);
    const seed = stableIndex(agent.id);

    if (kind === "talking_to_player") {
      if (desk) {
        return targetFromSeat("talk", desk, "talking_to_player");
      }
      return {
        key: "talk",
        x: agent.x,
        y: agent.y,
        facing: agent.facing,
        state: "talking_to_player",
      };
    }
    if (kind === "training_skill")
      return GYM_TARGETS[seed % GYM_TARGETS.length];
    if (kind === "using_memory") return MEMORY_TARGET;
    if (kind === "using_comms") return COMMS_TARGET;
    if (kind === "using_tools") return TOOLS_TARGET;
    if (kind === "working_at_desk" && desk) {
      return targetFromSeat("desk", desk, "working_at_desk");
    }
    if (kind === "resting" && rest) {
      return targetFromSeat("rest", rest, "sitting");
    }
    if (kind === "idle_patrol") {
      if (desk) {
        return targetFromSeat("desk_idle", desk, "sitting");
      }
      if (rest) return targetFromSeat("rest", rest, "sitting");
    }
    return rest ? targetFromSeat("rest", rest, "sitting") : null;
  };

  useLayoutEffect(() => {
    const prev = lookupRef.current;
    let unchanged = agents.length === prev.size;
    if (unchanged) {
      for (const agent of agents) {
        const existing = prev.get(agent.id);
        const existingPos =
          existing && "position" in existing
            ? (existing as unknown as OfficeAgent).position
            : undefined;
        if (
          !existing ||
          existing.status !== agent.status ||
          existingPos !== agent.position
        ) {
          unchanged = false;
          break;
        }
      }
    }
    if (unchanged) return;

    const next: RenderAgent[] = agents.map((agent) => {
      const existing = prev.get(agent.id);
      if (existing) return { ...existing, ...agent };
      return makeRenderAgent(agent);
    });
    agentsRef.current = next;
    if (liveAgentsRef) liveAgentsRef.current = next;
    const lookup = new Map<string, RenderAgent>();
    for (const a of next) lookup.set(a.id, a);
    lookupRef.current = lookup;
    for (const id of [...controllerRef.current.keys()]) {
      if (!lookup.has(id)) controllerRef.current.delete(id);
    }
  }, [agents, liveAgentsRef]);

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05);
    const nowMs = state.clock.elapsedTime * 1000;
    const liveAgents = agentsRef.current;
    if (liveAgentsRef && liveAgentsRef.current !== liveAgents) {
      liveAgentsRef.current = liveAgents;
    }

    for (const agent of liveAgents) {
      agent.frame += step * 60;
      const behavior = agentBehaviorById?.[agent.id];
      agent.behavior = behavior;
      const goal = resolveBehaviorTarget(agent, behavior);

      let ctrl = controllerRef.current.get(agent.id);
      if (!ctrl) {
        ctrl = makeController();
        controllerRef.current.set(agent.id, ctrl);
      }

      if (!goal) {
        agent.state = "standing";
        continue;
      }

      if (
        ctrl.goalKey !== goal.key ||
        ctrl.goalX !== goal.x ||
        ctrl.goalY !== goal.y ||
        ctrl.goalState !== goal.state
      ) {
        ctrl.goalKey = goal.key;
        ctrl.goalX = goal.x;
        ctrl.goalY = goal.y;
        ctrl.goalState = goal.state;
        ctrl.mode = "toTarget";
        ctrl.doorPauseUntil = 0;
        ctrl.doorPauseKey = null;
        agent.path = findOfficePath({ x: agent.x, y: agent.y }, goal);
        agent.workoutStyle = goal.workoutStyle;
      }

      if (behavior?.kind === "talking_to_player") {
        const playerX =
          (state.camera.position.x + (CANVAS_W * SCALE) / 2) / SCALE;
        const playerY =
          (state.camera.position.z + (CANVAS_H * SCALE) / 2) / SCALE;
        agent.path = [];
        agent.targetX = agent.x;
        agent.targetY = agent.y;
        agent.facing = Math.atan2(playerX - agent.x, playerY - agent.y);
        agent.state = "talking_to_player";
        continue;
      }

      const moveToward = (tx: number, ty: number): boolean => {
        const dx = tx - agent.x;
        const dy = ty - agent.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= ARRIVE_DISTANCE) {
          agent.x = tx;
          agent.y = ty;
          return true;
        }
        const move = Math.min(dist, WALK_UNITS_PER_SEC * step);
        const nextX = agent.x + (dx / dist) * move;
        const nextY = agent.y + (dy / dist) * move;
        const walkingToGoal = Math.hypot(tx - goal.x, ty - goal.y) <= 0.01;
        if (!walkingToGoal && !isAgentCanvasPointWalkable({ x: nextX, y: nextY })) {
          agent.path = findOfficePath({ x: agent.x, y: agent.y }, goal);
          return false;
        }
        agent.x = nextX;
        agent.y = nextY;
        agent.facing = Math.atan2(dx, dy);
        agent.state = "walking";
        return false;
      };

      if (ctrl.doorPauseUntil > nowMs) {
        agent.targetX = agent.x;
        agent.targetY = agent.y;
        agent.state = "opening_door";
        continue;
      }

      if (ctrl.mode === "performing") {
        agent.x = goal.x;
        agent.y = goal.y;
        agent.facing = goal.facing;
        agent.state = goal.state;
        agent.workoutStyle = goal.workoutStyle;
        continue;
      }

      if (agent.path.length === 0) {
        agent.path = findOfficePath({ x: agent.x, y: agent.y }, goal);
      }

      const next = agent.path[0];
      if (!next) {
        agent.targetX = agent.x;
        agent.targetY = agent.y;
        agent.state = "standing";
        continue;
      }

      const nearbyDoor = DOOR_CENTERS.find(
        (door) =>
          door.id !== ctrl.doorPauseKey &&
          Math.hypot(agent.x - door.x, agent.y - door.y) < DOOR_PAUSE_RADIUS,
      );
      if (nearbyDoor) {
        ctrl.doorPauseKey = nearbyDoor.id;
        ctrl.doorPauseUntil = nowMs + DOOR_PAUSE_MS;
        agent.facing = Math.atan2(
          nearbyDoor.x - agent.x,
          nearbyDoor.y - agent.y,
        );
        agent.state = "opening_door";
        continue;
      }

      if (moveToward(next.x, next.y)) {
        if (agent.path.length > 0) agent.path.shift();
      }

      if (agent.path.length === 0) {
        agent.facing = goal.facing;
        agent.state = goal.state;
        agent.workoutStyle = goal.workoutStyle;
        ctrl.mode = "performing";
      }
    }

    if (onDeskSeatedAgentsChange) {
      const seated = new Set<string>();
      const controller = controllerRef.current;
      for (const agent of liveAgents) {
        const ctrl = controller.get(agent.id);
        if (
          ctrl?.goalKey === "desk" &&
          ctrl.mode === "performing" &&
          agent.state === "working_at_desk"
        ) {
          seated.add(agent.id);
        }
      }
      const nextKey = [...seated].sort().join("\n");
      if (nextKey !== deskSeatedKeyRef.current) {
        deskSeatedKeyRef.current = nextKey;
        onDeskSeatedAgentsChange(seated);
      }
    }
  });

  return (
    <>
      {agents.map((agent) => (
        <AgentModel
          key={agent.id}
          agentId={agent.id}
          name={agent.name}
          subtitle={null}
          status={agent.status}
          color={agent.color}
          appearance={agent.avatarProfile}
          agentsRef={agentsRef}
          agentLookupRef={lookupRef}
          onClick={onSelect}
          onInteract={onInteract}
          showSpeech={selectedId === agent.id}
          speechText={selectedId === agent.id ? "老板，有什么事吗。" : null}
          riggedModelUrl={
            agent.position === "ceo" ? RIGGED_EMPLOYEE_URL : RIGGED_MAN_URL
          }
          riggedModelTint={agent.position === "ceo" ? null : agent.color}
        />
      ))}
    </>
  );
});
