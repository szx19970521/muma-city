import type { ChatToolEvent } from "../../../../../../shared/chat-stream";
import type { OfficeAgent, OfficeAgentTask } from "./types";

export type AgentBehaviorKind =
  | "talking_to_player"
  | "working_at_desk"
  | "training_skill"
  | "using_memory"
  | "using_comms"
  | "using_tools"
  | "idle_patrol"
  | "resting";

export type AgentBehaviorCategory =
  | "task"
  | "skill"
  | "memory"
  | "comms"
  | "tools"
  | "idle";

export type AgentWorkspacePanel =
  | "kanban"
  | "memory"
  | "skills"
  | "tools"
  | "schedules"
  | "gateway"
  | "settings";

export interface AgentSceneActivity {
  agentId: string | null;
  category: AgentBehaviorCategory;
  label?: string;
  expiresAt: number;
}

export interface AgentBehaviorIntent {
  kind: AgentBehaviorKind;
  source: "chat" | "tool" | "panel" | "task" | "gateway" | "idle";
  label?: string;
}

export interface BuildAgentBehaviorInput {
  agent: Pick<OfficeAgent, "id" | "status">;
  task?: OfficeAgentTask;
  activeConversationAgentId?: string | null;
  sceneActivity?: AgentSceneActivity | null;
  now: number;
}

const ACTIVE_TASK_STATUSES = new Set([
  "running",
  "ready",
  "todo",
  "triage",
  "blocked",
]);

function behaviorFromCategory(
  category: AgentBehaviorCategory,
): AgentBehaviorKind {
  switch (category) {
    case "skill":
      return "training_skill";
    case "memory":
      return "using_memory";
    case "tools":
      return "using_tools";
    case "comms":
      return "using_comms";
    case "task":
      return "working_at_desk";
    case "idle":
    default:
      return "idle_patrol";
  }
}

export function categoryFromWorkspacePanel(
  panel: AgentWorkspacePanel,
): AgentBehaviorCategory {
  switch (panel) {
    case "skills":
      return "skill";
    case "memory":
      return "memory";
    case "tools":
      return "tools";
    case "gateway":
    case "schedules":
    case "settings":
      return "comms";
    case "kanban":
    default:
      return "task";
  }
}

export function classifyToolEventCategory(
  event: Pick<ChatToolEvent, "name" | "label" | "preview" | "result">,
): AgentBehaviorCategory {
  const text = [event.name, event.label, event.preview, event.result]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/(skill|skills|install|training|train|toolset)/.test(text)) {
    return "skill";
  }
  if (
    /(memory|memories|remember|recall|profile|user\.md|memory\.md)/.test(text)
  ) {
    return "memory";
  }
  if (
    /(gateway|telegram|discord|slack|mattermost|wecom|message|messaging|connector|mcp|server)/.test(
      text,
    )
  ) {
    return "comms";
  }
  if (/(kanban|task|todo|board|mission|schedule|cron)/.test(text)) {
    return "task";
  }
  return "task";
}

export function sceneActivityFromPanel({
  panel,
  agentId,
  now,
}: {
  panel: AgentWorkspacePanel;
  agentId: string | null;
  now: number;
}): AgentSceneActivity {
  return {
    agentId,
    category: categoryFromWorkspacePanel(panel),
    expiresAt: now + 90_000,
  };
}

export function sceneActivityFromToolEvent({
  event,
  agentId,
  now,
}: {
  event: ChatToolEvent;
  agentId: string | null;
  now: number;
}): AgentSceneActivity | null {
  if (event.status === "completed" || event.status === "failed") return null;
  return {
    agentId,
    category: classifyToolEventCategory(event),
    label: event.label || event.name,
    expiresAt: now + 45_000,
  };
}

export function buildAgentBehaviorIntent({
  agent,
  task,
  activeConversationAgentId,
  sceneActivity,
  now,
}: BuildAgentBehaviorInput): AgentBehaviorIntent {
  if (
    sceneActivity &&
    sceneActivity.agentId === agent.id &&
    sceneActivity.expiresAt > now
  ) {
    return {
      kind: behaviorFromCategory(sceneActivity.category),
      source: sceneActivity.label ? "tool" : "panel",
      label: sceneActivity.label,
    };
  }

  if (task && ACTIVE_TASK_STATUSES.has(task.status)) {
    return {
      kind: "working_at_desk",
      source: "task",
      label: task.title,
    };
  }

  if (activeConversationAgentId === agent.id) {
    return { kind: "talking_to_player", source: "chat" };
  }

  if (agent.status === "working") {
    return { kind: "working_at_desk", source: "gateway" };
  }

  if (agent.status === "error") {
    return { kind: "resting", source: "idle" };
  }

  return { kind: "idle_patrol", source: "idle" };
}

export function buildAgentBehaviorMap({
  agents,
  taskByAgentId,
  activeConversationAgentId,
  sceneActivity,
  now,
}: {
  agents: OfficeAgent[];
  taskByAgentId: Record<string, OfficeAgentTask>;
  activeConversationAgentId?: string | null;
  sceneActivity?: AgentSceneActivity | null;
  now: number;
}): Record<string, AgentBehaviorIntent> {
  return Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      buildAgentBehaviorIntent({
        agent,
        task: taskByAgentId[agent.id],
        activeConversationAgentId,
        sceneActivity,
        now,
      }),
    ]),
  );
}
