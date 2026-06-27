import { describe, expect, it } from "vitest";
import type { ChatToolEvent } from "../../../../../../shared/chat-stream";
import {
  buildAgentBehaviorIntent,
  buildAgentBehaviorMap,
  categoryFromWorkspacePanel,
  classifyToolEventCategory,
  sceneActivityFromPanel,
  sceneActivityFromToolEvent,
} from "./agentBehavior";
import type { OfficeAgent, OfficeAgentTask } from "./types";

const agent: OfficeAgent = {
  id: "agent-1",
  name: "Default",
  status: "idle",
  color: "#2563eb",
  item: "agent",
};

function task(status: string): OfficeAgentTask {
  return {
    id: `task-${status}`,
    title: "Implement feature",
    assignee: agent.id,
    status,
    priority: 0,
    created_at: null,
    started_at: null,
  };
}

function toolEvent(patch: Partial<ChatToolEvent> = {}): ChatToolEvent {
  return {
    callId: "call-1",
    name: "tool",
    status: "running",
    ...patch,
  };
}

describe("agent behavior mapping", () => {
  it("keeps concrete scene work ahead of passive chat posture", () => {
    const intent = buildAgentBehaviorIntent({
      agent,
      task: task("running"),
      activeConversationAgentId: agent.id,
      sceneActivity: sceneActivityFromPanel({
        panel: "skills",
        agentId: agent.id,
        now: 100,
      }),
      now: 100,
    });

    expect(intent).toEqual({
      kind: "training_skill",
      source: "panel",
    });
  });

  it("maps task and gateway work to desk work", () => {
    expect(
      buildAgentBehaviorIntent({
        agent,
        task: task("running"),
        activeConversationAgentId: agent.id,
        now: 100,
      }),
    ).toEqual({
      kind: "working_at_desk",
      source: "task",
      label: "Implement feature",
    });

    expect(
      buildAgentBehaviorIntent({
        agent,
        task: task("blocked"),
        now: 100,
      }).kind,
    ).toBe("working_at_desk");

    expect(
      buildAgentBehaviorIntent({
        agent: { ...agent, status: "working" },
        now: 100,
      }),
    ).toEqual({ kind: "working_at_desk", source: "gateway" });
  });

  it("maps panel and tool categories to scene actions", () => {
    expect(categoryFromWorkspacePanel("skills")).toBe("skill");
    expect(categoryFromWorkspacePanel("memory")).toBe("memory");
    expect(categoryFromWorkspacePanel("tools")).toBe("tools");
    expect(categoryFromWorkspacePanel("gateway")).toBe("comms");
    expect(categoryFromWorkspacePanel("kanban")).toBe("task");

    expect(
      classifyToolEventCategory(toolEvent({ name: "install-skill" })),
    ).toBe("skill");
    expect(
      classifyToolEventCategory(toolEvent({ preview: "read memory.md" })),
    ).toBe("memory");
    expect(
      classifyToolEventCategory(toolEvent({ label: "Slack connector" })),
    ).toBe("comms");
  });

  it("ignores completed tool events and expires scene activity", () => {
    expect(
      sceneActivityFromToolEvent({
        event: toolEvent({ status: "completed" }),
        agentId: agent.id,
        now: 100,
      }),
    ).toBeNull();

    const intent = buildAgentBehaviorIntent({
      agent,
      sceneActivity: {
        agentId: agent.id,
        category: "skill",
        expiresAt: 99,
      },
      now: 100,
    });

    expect(intent).toEqual({ kind: "idle_patrol", source: "idle" });
  });

  it("builds per-agent maps without leaking another agent activity", () => {
    const other: OfficeAgent = {
      ...agent,
      id: "agent-2",
      name: "Other",
      status: "idle",
    };

    const map = buildAgentBehaviorMap({
      agents: [agent, other],
      taskByAgentId: { [other.id]: task("ready") },
      sceneActivity: sceneActivityFromPanel({
        panel: "memory",
        agentId: agent.id,
        now: 100,
      }),
      now: 100,
    });

    expect(map[agent.id]).toEqual({ kind: "using_memory", source: "panel" });
    expect(map[other.id]?.kind).toBe("working_at_desk");
  });

  it("maps the tools panel to the tool room activity", () => {
    const intent = buildAgentBehaviorIntent({
      agent,
      sceneActivity: sceneActivityFromPanel({
        panel: "tools",
        agentId: agent.id,
        now: 100,
      }),
      now: 100,
    });

    expect(intent).toEqual({ kind: "using_tools", source: "panel" });
  });
});
