import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crown,
  MoreHorizontal,
  MessageSquare,
  Move,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  Users,
  X,
} from "lucide-react";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useI18n } from "../../components/useI18n";
import Gateway from "../Gateway/Gateway";
import Kanban from "../Kanban/Kanban";
import Memory from "../Memory/Memory";
import Schedules from "../Schedules/Schedules";
import Settings from "../Settings/Settings";
import Skills from "../Skills/Skills";
import Tools from "../Tools/Tools";
import Office3D from "./office3d/Office3D";
import AvatarLab from "./office3d/avatarLab/AvatarLab";
import { profilesToOfficeAgents } from "./office3d/agents";
import {
  INVENTORY_ITEMS,
  labelForHandAction,
  labelForHeldItem,
} from "./office3d/firstPerson/interactionMapping";
import {
  buildAgentBehaviorMap,
  sceneActivityFromPanel,
  sceneActivityFromToolEvent,
  type AgentSceneActivity,
  type AgentWorkspacePanel,
} from "./office3d/core/agentBehavior";
import type { OfficeAgent, OfficeAgentTask } from "./office3d/core/types";
import type {
  FirstPersonHudState,
  HeldItemKind,
} from "./office3d/firstPerson/types";

interface OfficeProps {
  profile?: string;
  visible?: boolean;
  onOpenView?: (view: WorkspaceDestination) => void;
  onNewChat?: () => void;
}

type WorkspaceDestination =
  | "chat"
  | "sessions"
  | "agents"
  | "models"
  | "kanban"
  | "memory"
  | "skills"
  | "tools"
  | "schedules"
  | "gateway"
  | "settings";

type WorkspacePanel = AgentWorkspacePanel;
type CameraMode = "firstPerson" | "orbit";

const WORKSPACE_PANEL_DESTINATIONS = new Set<WorkspaceDestination>([
  "kanban",
  "memory",
  "skills",
  "tools",
  "schedules",
  "gateway",
  "settings",
]);

function isWorkspacePanel(
  target: WorkspaceDestination,
): target is WorkspacePanel {
  return WORKSPACE_PANEL_DESTINATIONS.has(target);
}

const DEFAULT_FIRST_PERSON_HUD: FirstPersonHudState = {
  heldItem: "none",
  inventoryOpen: false,
  statusOpen: false,
  motion: { moving: false, pitch: 0, jumping: false, verticalOffset: 0 },
  lastAction: "idle",
};

interface ModelConfig {
  provider: string;
  model: string;
  baseUrl: string;
}

interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  createdAt: number;
}

interface LocalAgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

const TASK_STATUS_RANK: Record<string, number> = {
  running: 0,
  ready: 1,
  todo: 2,
  triage: 3,
  blocked: 4,
};

const RECOMMENDED_REAL_AGENT_COUNT = 4;
const RECOMMENDED_OFFICE_PROFILES = [
  { name: "planner", color: "#64748b" },
  { name: "researcher", color: "#0f766e" },
  { name: "operator", color: "#7c3aed" },
  { name: "designer", color: "#be123c" },
  { name: "analyst", color: "#b45309" },
] as const;

function normalizeTaskAssignee(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function pickPreferredTask(
  current: OfficeAgentTask | undefined,
  next: OfficeAgentTask,
): OfficeAgentTask {
  if (!current) return next;
  const currentRank = TASK_STATUS_RANK[current.status] ?? 99;
  const nextRank = TASK_STATUS_RANK[next.status] ?? 99;
  if (nextRank !== currentRank) return nextRank < currentRank ? next : current;
  if (next.priority !== current.priority) {
    return next.priority > current.priority ? next : current;
  }
  const currentTime = current.started_at ?? current.created_at ?? 0;
  const nextTime = next.started_at ?? next.created_at ?? 0;
  return nextTime > currentTime ? next : current;
}

// The CEO assignment is desktop-local UI state (one agent at a time), persisted
// across reloads like the app's other renderer preferences (theme, locale).
const CEO_STORAGE_KEY = "hermes:office:ceo";

function readStoredCeo(): string | null {
  try {
    return localStorage.getItem(CEO_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * The Office tab. Renders a native, in-renderer 3D office (no external dev
 * server / webview) where each Hermes profile appears as an interactive agent.
 */
function Office({
  profile,
  visible,
  onOpenView,
  onNewChat,
}: OfficeProps): React.JSX.Element {
  const { t } = useI18n();
  const [agents, setAgents] = useState<OfficeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ceoId, setCeoId] = useState<string | null>(readStoredCeo);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: "",
    model: "",
    baseUrl: "",
  });
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const [engineOpen, setEngineOpen] = useState(false);
  const [engineSavingId, setEngineSavingId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<WorkspacePanel | null>(null);
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [agentTaskById, setAgentTaskById] = useState<
    Record<string, OfficeAgentTask>
  >({});
  const [cameraMode, setCameraMode] = useState<CameraMode>("firstPerson");
  const [firstPersonHud, setFirstPersonHud] = useState<FirstPersonHudState>(
    DEFAULT_FIRST_PERSON_HUD,
  );
  const [firstPersonSelectedItemRequest, setFirstPersonSelectedItemRequest] =
    useState<{ item: HeldItemKind; tick: number }>({ item: "none", tick: 0 });
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [activeAgentChatId, setActiveAgentChatId] = useState<string | null>(
    null,
  );
  const [agentChatInput, setAgentChatInput] = useState("");
  const [agentMessages, setAgentMessages] = useState<
    Record<string, LocalAgentMessage[]>
  >({});
  const [agentChatLoading, setAgentChatLoading] = useState<
    Record<string, boolean>
  >({});
  const [sceneActivity, setSceneActivity] = useState<AgentSceneActivity | null>(
    null,
  );
  const [screenTaskNotice, setScreenTaskNotice] = useState<string | null>(null);
  const [sceneResetKey, setSceneResetKey] = useState(0);
  const [sceneBooting, setSceneBooting] = useState(true);
  const [creatingRecommendedAgents, setCreatingRecommendedAgents] =
    useState(false);
  const agentChatInputRef = useRef<HTMLInputElement>(null);
  // Developer building-mover: click a building, then click ground to reposition
  // it; positions are logged to the console so the cityPlan constants can be
  // updated to match.
  const [devMode, setDevMode] = useState(false);
  const [devLog, setDevLog] = useState<string | null>(null);
  const [avatarLabOpen, setAvatarLabOpen] = useState(false);

  const setCeo = useCallback((id: string | null) => {
    setCeoId(id);
    try {
      if (id) localStorage.setItem(CEO_STORAGE_KEY, id);
      else localStorage.removeItem(CEO_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable in sandboxed renderers
    }
  }, []);
  // Avoid refetching every time the tab regains visibility within a session;
  // only the first reveal and explicit refreshes hit IPC.
  const loadedOnce = useRef(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const profiles = await window.hermesAPI.listProfiles();
      setAgents(profilesToOfficeAgents(profiles));
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }, []);

  const createRecommendedAgents = useCallback(async (): Promise<void> => {
    if (creatingRecommendedAgents) return;
    setCreatingRecommendedAgents(true);
    setScreenTaskNotice(null);
    try {
      let profiles = await window.hermesAPI.listProfiles();
      const existing = new Set(profiles.map((entry) => entry.name));
      let created = 0;

      for (const recommended of RECOMMENDED_OFFICE_PROFILES) {
        if (profiles.length + created >= RECOMMENDED_REAL_AGENT_COUNT) break;
        if (existing.has(recommended.name)) continue;
        const result = await window.hermesAPI.createProfile(
          recommended.name,
          true,
        );
        if (!result.success) {
          throw new Error(
            result.error || `创建 ${recommended.name} 智能体失败`,
          );
        }
        existing.add(recommended.name);
        created += 1;
        await window.hermesAPI
          .setProfileColor(recommended.name, recommended.color)
          .catch(() => undefined);
      }

      profiles = await window.hermesAPI.listProfiles();
      setAgents(profilesToOfficeAgents(profiles));
      setScreenTaskNotice(
        created > 0
          ? `已创建 ${created} 个真实智能体`
          : "真实智能体已经足够",
      );
    } catch (error) {
      setScreenTaskNotice(
        `创建真实智能体失败：${(error as Error).message}`,
      );
      await loadAgents();
    } finally {
      setCreatingRecommendedAgents(false);
    }
  }, [creatingRecommendedAgents, loadAgents]);

  const loadWorkspaceStatus = useCallback(async () => {
    try {
      const [mc, gateway] = await Promise.all([
        window.hermesAPI.getModelConfig(profile),
        window.hermesAPI.gatewayStatus().catch(() => false),
      ]);
      setModelConfig(mc);
      setGatewayOnline(Boolean(gateway));
    } catch {
      setGatewayOnline(false);
    }
  }, [profile]);

  const loadSavedModels = useCallback(async () => {
    try {
      setSavedModels(await window.hermesAPI.listModels());
    } catch {
      setSavedModels([]);
    }
  }, []);

  const updateFirstPersonHud = useCallback(
    (patch: Partial<FirstPersonHudState>): void => {
      setFirstPersonHud((current) => ({
        ...current,
        ...patch,
        motion: patch.motion ?? current.motion,
      }));
    },
    [],
  );

  const selectFirstPersonItem = useCallback((item: HeldItemKind): void => {
    setFirstPersonSelectedItemRequest((current) => ({
      item,
      tick: current.tick + 1,
    }));
    setFirstPersonHud((current) => ({
      ...current,
      heldItem: item,
      lastAction: item === "none" ? "put_away" : current.lastAction,
      focusedTarget: undefined,
      interactionHint:
        item === "none" ? "已切换为空手" : `已装备${labelForHeldItem(item)}`,
      interactionHintMode: "toast",
    }));
  }, []);

  useEffect(() => {
    if (visible && !loadedOnce.current) {
      void loadAgents();
    }
  }, [visible, loadAgents]);

  useEffect(() => {
    if (visible) {
      void loadWorkspaceStatus();
      void loadSavedModels();
    }
  }, [visible, loadWorkspaceStatus, loadSavedModels]);

  // Background poll: re-read profiles while the tab is visible so a gateway
  // starting/stopping flips an agent's status (idle <-> working). The 3D
  // controller reacts to that change by walking the agent to its desk or to
  // the rest room. We update state only when something actually changed and
  // never toggle `loading`, so this stays flicker-free.
  const refreshAgentStatuses = useCallback(async () => {
    try {
      const profiles = await window.hermesAPI.listProfiles();
      const next = profilesToOfficeAgents(profiles);
      setAgents((prev) => {
        const prevById = new Map(prev.map((a) => [a.id, a]));
        const changed =
          next.length !== prev.length ||
          next.some((a) => {
            const before = prevById.get(a.id);
            return (
              !before ||
              before.status !== a.status ||
              before.gatewayRunning !== a.gatewayRunning
            );
          });
        return changed ? next : prev;
      });
    } catch {
      // Transient IPC failures are ignored; the next tick retries.
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => {
      void refreshAgentStatuses();
      void loadWorkspaceStatus();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [visible, refreshAgentStatuses, loadWorkspaceStatus]);

  // The initial fetch is driven solely by the visible-guard effect above
  // (gated on `!loadedOnce.current`). A second unconditional mount effect used
  // to live here too, but when the tab was visible on first render both fired
  // in the same commit and raced two concurrent `listProfiles` calls.

  useEffect(() => {
    // Only prune a stale CEO once profiles have loaded 鈥?otherwise the initial
    // empty `agents` array would wipe the just-restored CEO on every launch.
    if (loading) return;
    if (ceoId && !agents.some((a) => a.id === ceoId)) setCeo(null);
  }, [loading, agents, ceoId, setCeo]);

  // Tag each agent with its org position; the CEO drives the executive desk.
  const positionedAgents = useMemo<OfficeAgent[]>(
    () =>
      agents.map((a) => ({
        ...a,
        position: a.id === ceoId ? "ceo" : "employee",
      })),
    [agents, ceoId],
  );

  // Reset selection if the selected real agent disappears on refresh.
  useEffect(() => {
    if (selectedId && !positionedAgents.some((a) => a.id === selectedId)) {
      setSelectedId(null);
    }
  }, [positionedAgents, selectedId]);

  const loadAgentTasks = useCallback(async (): Promise<void> => {
    if (!visible || positionedAgents.length === 0) {
      setAgentTaskById({});
      return;
    }

    const agentIdByAssignee = new Map<string, string>();
    for (const agent of positionedAgents) {
      agentIdByAssignee.set(normalizeTaskAssignee(agent.id), agent.id);
      agentIdByAssignee.set(normalizeTaskAssignee(agent.name), agent.id);
    }

    try {
      const [tasksRes, hqRes] = await Promise.all([
        window.hermesAPI.kanbanListTasks({
          includeArchived: false,
          profile,
        }),
        window.hermesAPI.kanbanListClaw3dHqTasks(),
      ]);
      const tasks: OfficeAgentTask[] = [];
      if (tasksRes.success && tasksRes.data) tasks.push(...tasksRes.data);
      if (hqRes.success && hqRes.data) tasks.push(...hqRes.data);

      const nextByAgent: Record<string, OfficeAgentTask> = {};
      for (const task of tasks) {
        const agentId = agentIdByAssignee.get(
          normalizeTaskAssignee(task.assignee),
        );
        if (!agentId) continue;
        if (
          (TASK_STATUS_RANK[task.status] ?? 99) > TASK_STATUS_RANK["blocked"]
        ) {
          continue;
        }
        nextByAgent[agentId] = pickPreferredTask(nextByAgent[agentId], task);
      }
      setAgentTaskById(nextByAgent);
    } catch {
      setAgentTaskById({});
    }
  }, [positionedAgents, profile, visible]);

  useEffect(() => {
    if (!visible) return;
    void loadAgentTasks();
    const interval = window.setInterval(() => void loadAgentTasks(), 8000);
    return () => window.clearInterval(interval);
  }, [loadAgentTasks, visible]);

  useEffect(() => {
    setSceneBooting(true);
  }, [sceneResetKey]);

  const selectedAgent =
    positionedAgents.find((a) => a.id === selectedId) ?? null;
  const activeAgent =
    positionedAgents.find((a) => a.id === activeAgentChatId) ?? null;
  const selectedIsCeo = selectedAgent?.position === "ceo";
  const selectedStatusColor =
    selectedAgent?.status === "working"
      ? "#22c55e"
      : selectedAgent?.status === "error"
        ? "#ef4444"
        : "#f59e0b";

  const closeAgentChat = useCallback((): void => {
    if (!activeAgentChatId) return;
    setActiveAgentChatId(null);
    setAgentChatInput("");
    if (document.pointerLockElement) {
      void document.exitPointerLock();
    }
  }, [activeAgentChatId]);

  const openView = (target: WorkspaceDestination): void => {
    closeAgentChat();
    setHudMenuOpen(false);
    onOpenView?.(target);
  };

  const openRoomPanel = (target: WorkspaceDestination): void => {
    closeAgentChat();
    setHudMenuOpen(false);
    setFocusedTaskId(null);
    if (target === "chat") {
      if (onNewChat) onNewChat();
      else openView("chat");
      return;
    }
    if (target === "models") {
      setActivePanel(null);
      setEngineOpen(true);
      return;
    }
    if (target === "agents") {
      openView("agents");
      return;
    }
    if (target === "sessions") {
      openView("sessions");
      return;
    }
    if (!isWorkspacePanel(target)) {
      openView(target);
      return;
    }
    setEngineOpen(false);
    setActivePanel(target);
    setSceneActivity(
      sceneActivityFromPanel({
        panel: target,
        agentId:
          selectedId ?? activeAgentChatId ?? positionedAgents[0]?.id ?? null,
        now: Date.now(),
      }),
    );
  };

  const selectEngineModel = async (entry: SavedModel): Promise<void> => {
    setEngineSavingId(entry.id);
    try {
      const effectiveBaseUrl =
        entry.provider === "custom" || entry.provider.includes("ollama")
          ? entry.baseUrl
          : "";
      await window.hermesAPI.setModelConfig(
        entry.provider,
        entry.model,
        effectiveBaseUrl,
        profile,
      );
      setModelConfig({
        provider: entry.provider,
        model: entry.model,
        baseUrl: effectiveBaseUrl,
      });
      setEngineOpen(false);
    } catch {
      // Keep the popover open so the user can try another saved engine.
    } finally {
      setEngineSavingId(null);
    }
  };

  const currentModel =
    modelConfig.model || positionedAgents[0]?.model || "gpt-5.5";
  const currentProvider =
    modelConfig.provider || positionedAgents[0]?.provider || "openai-codex";
  const agentBehaviorById = useMemo(
    () =>
      buildAgentBehaviorMap({
        agents: positionedAgents,
        taskByAgentId: agentTaskById,
        activeConversationAgentId: activeAgentChatId,
        sceneActivity,
        now: Date.now(),
      }),
    [activeAgentChatId, agentTaskById, positionedAgents, sceneActivity],
  );

  useEffect(() => {
    if (!sceneActivity) return;
    const delay = Math.max(0, sceneActivity.expiresAt - Date.now());
    const timeout = window.setTimeout(() => {
      setSceneActivity((current) =>
        current === sceneActivity ? null : current,
      );
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [sceneActivity]);

  const openAgentChat = useCallback(
    (agentId: string): void => {
      setSelectedId(agentId);
      setActivePanel(null);
      setEngineOpen(false);
      setSceneActivity(null);
      setActiveAgentChatId(agentId);
      setAgentChatInput("");
      if (document.pointerLockElement) {
        void document.exitPointerLock();
      }
      window.setTimeout(() => agentChatInputRef.current?.focus(), 0);
    },
    [],
  );

  const openAgentTask = useCallback(
    (agentId: string): void => {
      const task = agentTaskById[agentId];
      if (!task) {
        const agentName =
          positionedAgents.find((agent) => agent.id === agentId)?.name ??
          agentId;
        setSelectedId(agentId);
        setActiveAgentChatId(null);
        setAgentChatInput("");
        setEngineOpen(false);
        setSceneActivity(null);
        setScreenTaskNotice(`${agentName}: \u6682\u65e0\u6267\u884c\u4efb\u52a1`);
        if (document.pointerLockElement) {
          void document.exitPointerLock();
        }
        return;
      }

      setSelectedId(agentId);
      setActiveAgentChatId(null);
      setAgentChatInput("");
      setEngineOpen(false);
      setFocusedTaskId(task.id);
      setActivePanel("kanban");
      setSceneActivity(
        sceneActivityFromPanel({
          panel: "kanban",
          agentId,
          now: Date.now(),
        }),
      );
      if (document.pointerLockElement) {
        void document.exitPointerLock();
      }
    },
    [agentTaskById, positionedAgents],
  );

  useEffect(() => {
    if (!screenTaskNotice) return;
    const timeout = window.setTimeout(() => setScreenTaskNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [screenTaskNotice]);

  useEffect(() => {
    if (!activeAgentChatId) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeAgentChat();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [activeAgentChatId, closeAgentChat]);

  useEffect(() => {
    if (!activeAgentChatId) return;
    const sessionId = `office-${activeAgentChatId}`;
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const items = (await window.hermesAPI.getSessionMessages(
          sessionId,
        )) as Array<{
          kind: "user" | "assistant";
          id: number;
          content?: string;
        }>;
        if (cancelled) return;
        const loaded = items
          .filter((it) => it.kind === "user" || it.kind === "assistant")
          .map<LocalAgentMessage>((it) => ({
            id: `db-${it.id}`,
            role: it.kind === "user" ? "user" : "agent",
            text: it.content || "",
          }));
        setAgentMessages((prev) => ({
          ...prev,
          [activeAgentChatId]: loaded.slice(-6),
        }));
      } catch {
        // No prior local office session yet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAgentChatId]);

  useEffect(() => {
    const cleanup = window.hermesAPI.onChatToolEvent((_runId, event) => {
      const next = sceneActivityFromToolEvent({
        event,
        agentId:
          activeAgentChatId ?? selectedId ?? positionedAgents[0]?.id ?? null,
        now: Date.now(),
      });
      if (next) setSceneActivity(next);
    });
    return cleanup;
  }, [activeAgentChatId, positionedAgents, selectedId]);

  const sendAgentMessage = async (): Promise<void> => {
    if (!activeAgent || !agentChatInput.trim()) return;

    const text = agentChatInput.trim();
    const agentId = activeAgent.id;
    const sessionId = `office-${agentId}`;
    setSceneActivity({
      agentId,
      category: "task",
      label: text,
      expiresAt: Date.now() + 90_000,
    });
    const history = (agentMessages[agentId] ?? []).map((message) => ({
      role: message.role === "agent" ? "assistant" : "user",
      content: message.text,
    }));

    setAgentChatInput("");
    setAgentMessages((prev) => ({
      ...prev,
      [agentId]: [
        ...(prev[agentId] ?? []),
        { id: `pending-${Date.now()}`, role: "user" as const, text },
      ].slice(-6),
    }));
    setAgentChatLoading((prev) => ({ ...prev, [agentId]: true }));

    try {
      await window.hermesAPI.sendMessage(text, agentId, sessionId, history);
      const items = (await window.hermesAPI.getSessionMessages(
        sessionId,
      )) as Array<{
        kind: "user" | "assistant";
        id: number;
        content?: string;
      }>;
      const loaded = items
        .filter((it) => it.kind === "user" || it.kind === "assistant")
        .map<LocalAgentMessage>((it) => ({
          id: `db-${it.id}`,
          role: it.kind === "user" ? "user" : "agent",
          text: it.content || "",
        }));
      setAgentMessages((prev) => ({ ...prev, [agentId]: loaded.slice(-6) }));
    } catch (error) {
      setAgentMessages((prev) => ({
        ...prev,
        [agentId]: [
          ...(prev[agentId] ?? []),
          {
            id: `err-${Date.now()}`,
            role: "agent" as const,
            text: `鍙戦€佸け璐ワ細${(error as Error).message}`,
          },
        ].slice(-6),
      }));
    } finally {
      setAgentChatLoading((prev) => ({ ...prev, [agentId]: false }));
      window.setTimeout(() => agentChatInputRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    if (!engineOpen && !activePanel) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setEngineOpen(false);
      setActivePanel(null);
      setHudMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activePanel, engineOpen]);

  useEffect(() => {
    if (!hudMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setHudMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [hudMenuOpen]);

  const panelTitle = activePanel
    ? (
        {
          kanban: t("office.workspace.boardTitle"),
          memory: t("office.workspace.libraryTitle"),
          skills: t("navigation.skills"),
          gateway: t("office.workspace.commsTitle"),
          tools: t("office.workspace.toolsTitle"),
          schedules: t("office.workspace.scheduleTitle"),
          settings: t("office.workspace.settingsTitle"),
        } satisfies Record<WorkspacePanel, string>
      )[activePanel]
    : "";
  const panelMeta = activePanel
    ? (
        {
          kanban: {
            code: "MISSION BOARD",
            location: "任务白板终端",
            subtitle: "任务、派发、执行状态会同步到场景里的白板。",
          },
          memory: {
            code: "MEMORY VAULT",
            location: "记忆库终端",
            subtitle: "长期记忆与用户画像作为城市档案在这里维护。",
          },
          skills: {
            code: "SKILL DECK",
            location: "健身房训练台",
            subtitle: "技能训练和工具能力保持原有流程，只换成场景内面板。",
          },
          gateway: {
            code: "COMMS HUB",
            location: "通讯中心控制台",
            subtitle: "各平台连接状态仍由原功能页负责，外层只提供沉浸式框架。",
          },
          tools: {
            code: "TOOL ARCHIVE",
            location: "工具仓库",
            subtitle: "浏览和管理工具能力，数据与操作逻辑保持不变。",
          },
          schedules: {
            code: "TIME TABLE",
            location: "日程控制台",
            subtitle: "自动化和计划任务以场景终端方式呈现。",
          },
          settings: {
            code: "SYSTEM CORE",
            location: "系统设置舱",
            subtitle: "配置项仍使用原设置页，降低修改风险。",
          },
        } satisfies Record<
          WorkspacePanel,
          { code: string; location: string; subtitle: string }
        >
      )[activePanel]
    : null;

  const renderWorkspacePanel = (): React.JSX.Element | null => {
    switch (activePanel) {
      case "kanban":
        return <Kanban profile={profile} visible focusTaskId={focusedTaskId} />;
      case "memory":
        return <Memory profile={profile} />;
      case "skills":
        return (
          <Skills
            profile={profile}
            embedded
            onBrowse={() => {
              setActivePanel(null);
              openView("tools");
            }}
          />
        );
      case "gateway":
        return <Gateway profile={profile} />;
      case "tools":
        return (
          <Tools
            profile={profile}
            showPlatformToolsets
            remoteMode={false}
            visible
            onBrowseSkills={() => {
              setActivePanel(null);
              openView("tools");
            }}
            onBrowseMcps={() => {
              setActivePanel(null);
              openView("tools");
            }}
          />
        );
      case "schedules":
        return <Schedules profile={profile} />;
      case "settings":
        return <Settings profile={profile} />;
      default:
        return null;
    }
  };

  const firstPersonHintText = firstPersonHud.interactionHint;
  const shouldShowFirstPersonHint = Boolean(
    firstPersonHud.focusedTarget || firstPersonHintText,
  );
  const firstPersonHintMode =
    firstPersonHud.interactionHintMode ??
    (firstPersonHud.focusedTarget ? "target" : "held");
  const firstPersonHintTitle =
    firstPersonHud.focusedTarget ?? labelForHeldItem(firstPersonHud.heldItem);

  return (
    <div className="aimashi-office muma-city-immersive">
      <header className="aimashi-office-header">
        <div className="aimashi-office-title">
          <span>{t("office.title")}</span>
          <p>{t("office.subtitle")}</p>
        </div>
        <div className="aimashi-office-actions">
          <button
            type="button"
            className="aimashi-status-pill"
            onClick={() => openView("chat")}
            title={t("office.workspace.chatTitle")}
          >
            <MessageSquare size={15} />
            {t("office.workspace.chatTitle")}
          </button>
          <button
            type="button"
            className="aimashi-status-pill"
            onClick={() => openView("agents")}
            title={t("office.agentCount", { count: agents.length })}
          >
            <Users size={15} />
            {t("office.agentCount", { count: agents.length })}
          </button>
          {agents.length < RECOMMENDED_REAL_AGENT_COUNT && (
            <button
              type="button"
              className="aimashi-status-pill"
              onClick={() => void createRecommendedAgents()}
              disabled={creatingRecommendedAgents}
              title="创建可聊天、可执行任务的真实智能体"
            >
              <Users size={15} />
              {creatingRecommendedAgents
                ? "创建中..."
                : `创建${RECOMMENDED_REAL_AGENT_COUNT - agents.length}个真实智能体`}
            </button>
          )}
          <button
            type="button"
            className={`aimashi-status-pill ${
              avatarLabOpen ? "active" : ""
            }`}
            onClick={() => setAvatarLabOpen(true)}
            title="隔离预览候选玩家/智能体人物，不改正式场景"
          >
            <Users size={14} />
            角色实验室
          </button>
          <button
            type="button"
            className={`aimashi-status-pill ${
              cameraMode === "firstPerson" ? "active" : ""
            }`}
            onClick={() => {
              setEngineOpen(false);
              setActivePanel(null);
              setCameraMode((mode) =>
                mode === "firstPerson" ? "orbit" : "firstPerson",
              );
            }}
            title={t("office.workspace.cameraModeTitle")}
          >
            <Move size={15} />
            {cameraMode === "firstPerson"
              ? t("office.workspace.firstPerson")
              : t("office.workspace.orbitView")}
          </button>
          <button
            type="button"
            onClick={() => void loadAgents()}
            disabled={loading}
            title={t("office.refresh")}
            className="aimashi-status-pill"
          >
            <RefreshCw
              size={14}
              style={{
                animation: loading ? "spin 1s linear infinite" : undefined,
              }}
            />
            {t("office.refresh")}
          </button>
          <button
            type="button"
            className="aimashi-status-pill"
            onClick={() => openRoomPanel("settings")}
            title={t("office.workspace.settingsTitle")}
          >
            <SettingsIcon size={15} />
            {t("office.workspace.settingsTitle")}
          </button>
          <div className="aimashi-hud-menu">
            <button
              type="button"
              className={`aimashi-status-pill ${hudMenuOpen ? "active" : ""}`}
              onClick={() => setHudMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={hudMenuOpen}
              title="更多"
            >
              <MoreHorizontal size={16} />
              更多
            </button>
            {hudMenuOpen && (
              <div className="aimashi-hud-menu-popover" role="menu">
                <button type="button" onClick={() => openView("sessions")}>
                  会话历史
                </button>
                <button type="button" onClick={() => openView("models")}>
                  {t("office.workspace.engineTitle")}
                </button>
                <button type="button" onClick={() => openRoomPanel("kanban")}>
                  {t("office.workspace.boardTitle")}
                </button>
                <button type="button" onClick={() => openRoomPanel("memory")}>
                  {t("office.workspace.libraryTitle")}
                </button>
                <button type="button" onClick={() => openRoomPanel("skills")}>
                  {t("navigation.skills")}
                </button>
                <button type="button" onClick={() => openRoomPanel("tools")}>
                  {t("office.workspace.toolsTitle")}
                </button>
                <button type="button" onClick={() => openRoomPanel("gateway")}>
                  {t("office.workspace.commsTitle")}
                </button>
                <button
                  type="button"
                  onClick={() => openRoomPanel("schedules")}
                >
                  {t("office.workspace.scheduleTitle")}
                </button>
                {agents.length < RECOMMENDED_REAL_AGENT_COUNT && (
                  <button
                    type="button"
                    onClick={() => void createRecommendedAgents()}
                    disabled={creatingRecommendedAgents}
                  >
                    {creatingRecommendedAgents
                      ? "创建中..."
                      : `创建${RECOMMENDED_REAL_AGENT_COUNT - agents.length}个真实智能体`}
                  </button>
                )}
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() =>
                      setDevMode((v) => {
                        const next = !v;
                        console.log(
                          `[office] Move-buildings mode ${next ? "ON" : "OFF"} - click a building, then click the ground.`,
                        );
                        return next;
                      })
                    }
                  >
                    {devMode ? "关闭建筑移动" : "开发：移动建筑"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="aimashi-office-scene">
        <ErrorBoundary
          key={sceneResetKey}
          fallback={
            <div className="aimashi-office-scene-fallback" role="alert">
              <strong>3D scene failed to load</strong>
              <p>
                The workspace UI is still available. Retry the scene or switch
                to another view while the startup error is diagnosed.
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setSceneResetKey((key) => key + 1)}
                >
                  Retry 3D
                </button>
                <button type="button" onClick={() => openView("chat")}>
                  Open chat
                </button>
              </div>
            </div>
          }
        >
          <Office3D
            agents={positionedAgents}
            selectedId={selectedId}
            onSelectAgent={setSelectedId}
            currentModel={currentModel}
            currentProvider={currentProvider}
            gatewayOnline={gatewayOnline}
            onOpenView={openRoomPanel}
            onStartChat={() => {
              if (onNewChat) onNewChat();
              else openView("chat");
            }}
            onAgentInteract={openAgentChat}
            onOpenAgentTask={openAgentTask}
            agentTaskById={agentTaskById}
            agentBehaviorById={agentBehaviorById}
            onToggleEngine={() => {
              closeAgentChat();
              setHudMenuOpen(false);
              setActivePanel(null);
              setEngineOpen((open) => !open);
            }}
            onSceneMissed={() => {
              closeAgentChat();
              setHudMenuOpen(false);
              setEngineOpen(false);
              setActivePanel(null);
            }}
            cameraMode={cameraMode}
            firstPersonInputEnabled={
              !activeAgent && !engineOpen && !activePanel && !avatarLabOpen
            }
            firstPersonSelectedItemRequest={firstPersonSelectedItemRequest}
            onFirstPersonHudChange={updateFirstPersonHud}
            devMode={devMode}
            onDevLog={setDevLog}
            onReady={() => setSceneBooting(false)}
          />
          {sceneBooting && (
            <div
              className="aimashi-office-scene-loading"
              role="status"
              aria-live="polite"
            >
              <span>牧马城市</span>
              <strong>正在加载城市现场</strong>
              <small>3D 资源准备中</small>
            </div>
          )}
        </ErrorBoundary>

        {cameraMode === "firstPerson" && !activePanel && !engineOpen && (
          <div className="aimashi-fps-hud">
            <div className="aimashi-fps-reticle" />
            {shouldShowFirstPersonHint && (
              <div
                key={`${firstPersonHintMode}:${firstPersonHintTitle}:${firstPersonHintText ?? ""}`}
                className={`aimashi-fps-interaction-hint is-${firstPersonHintMode}`}
              >
                <strong>{firstPersonHintTitle}</strong>
                {firstPersonHintText ? <span>{firstPersonHintText}</span> : null}
              </div>
            )}
            {firstPersonHud.statusOpen && (
              <section className="aimashi-fps-status" aria-label="第一视角状态">
                <div>
                  <span>模型</span>
                  <strong>{currentModel}</strong>
                </div>
                <div>
                  <span>供应商</span>
                  <strong>{currentProvider}</strong>
                </div>
                <div>
                  <span>网关</span>
                  <strong>{gatewayOnline ? "在线" : "离线"}</strong>
                </div>
                <div>
                  <span>智能体</span>
                  <strong>{positionedAgents.length}</strong>
                </div>
                <div>
                  <span>动作</span>
                  <strong>{labelForHandAction(firstPersonHud.lastAction)}</strong>
                </div>
                {firstPersonHud.focusedTarget ? (
                  <div>
                    <span>目标</span>
                    <strong>{firstPersonHud.focusedTarget}</strong>
                  </div>
                ) : null}
                <div>
                  <span>手持</span>
                  <strong>{labelForHeldItem(firstPersonHud.heldItem)}</strong>
                </div>
              </section>
            )}
            {firstPersonHud.inventoryOpen && (
              <section className="aimashi-fps-inventory" aria-label="快捷背包">
                <div className="aimashi-fps-inventory-head">
                  <strong>快捷背包</strong>
                  <span>I / ESC 关闭 · 数字键快速切换 · 右键放下</span>
                </div>
                <div className="aimashi-fps-inventory-grid">
                  {INVENTORY_ITEMS.map((entry) => (
                    <button
                      type="button"
                      key={entry.item}
                      className={
                        firstPersonHud.heldItem === entry.item ? "active" : ""
                      }
                      onClick={() => selectFirstPersonItem(entry.item)}
                    >
                      <span>{entry.key}</span>
                      <strong>{entry.label}</strong>
                      <small>{entry.description}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {screenTaskNotice && !activePanel && !engineOpen && (
          <div className="aimashi-screen-task-notice" role="status">
            {screenTaskNotice}
          </div>
        )}

        {engineOpen && (
          <section className="aimashi-engine-popover">
            <div className="aimashi-engine-popover-head">
              <span>{t("office.workspace.engineTitle")}</span>
              <button
                type="button"
                onClick={() => {
                  setEngineOpen(false);
                  openView("models");
                }}
              >
                {t("office.workspace.engineOpenSettings")}
              </button>
            </div>
            {savedModels.length === 0 ? (
              <p>{t("office.workspace.engineNoSaved")}</p>
            ) : (
              <div className="aimashi-engine-list">
                {savedModels.slice(0, 6).map((entry) => {
                  const active =
                    entry.provider === modelConfig.provider &&
                    entry.model === modelConfig.model;
                  return (
                    <button
                      type="button"
                      key={entry.id}
                      className={active ? "active" : ""}
                      disabled={engineSavingId === entry.id}
                      onClick={() => void selectEngineModel(entry)}
                    >
                      <strong>{entry.name || entry.model}</strong>
                      <small>
                        {entry.provider} 路 {entry.model}
                      </small>
                      {active && (
                        <em>{t("office.workspace.engineSelected")}</em>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activePanel && (
          <div
            className="aimashi-workspace-window-backdrop"
            onClick={() => setActivePanel(null)}
          >
            <section
              className={`aimashi-workspace-window aimashi-workspace-window-${activePanel}`}
              data-panel={activePanel}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="aimashi-workspace-window-header">
                <div className="aimashi-workspace-window-title">
                  <span>{panelMeta?.code}</span>
                  <strong>{panelTitle}</strong>
                  <small>{panelMeta?.location}</small>
                </div>
                <div className="aimashi-workspace-window-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const target = activePanel;
                      setActivePanel(null);
                      openView(target);
                    }}
                  >
                    {t("office.workspace.openFullPage")}
                  </button>
                  <button
                    type="button"
                    aria-label={t("office.close")}
                    onClick={() => setActivePanel(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </header>
              <div
                className="aimashi-workspace-window-status"
                aria-hidden="true"
              >
                <span>SCENE LINK ACTIVE</span>
                <span>{panelMeta?.subtitle}</span>
              </div>
              <div className="aimashi-workspace-window-body">
                {renderWorkspacePanel()}
              </div>
              <footer
                className="aimashi-workspace-window-footer"
                aria-hidden="true"
              >
                <span>ESC 关闭</span>
                <span>打开完整页会切换到原生功能界面</span>
              </footer>
            </section>
          </div>
        )}

        {activeAgent && (
          <>
            <button
              type="button"
              className="aimashi-agent-chat-dismiss"
              aria-label={t("office.close")}
              onClick={closeAgentChat}
            />
            <section className="aimashi-agent-chat-panel">
              <header className="aimashi-agent-chat-head">
                <span
                  className="aimashi-agent-chat-dot"
                  style={{ background: activeAgent.color }}
                />
                <div>
                  <strong>{activeAgent.name}</strong>
                  <small>
                    对话中 ·{" "}
                    {activeAgent.gatewayRunning
                      ? t(`office.status_${activeAgent.status}`)
                      : t("office.gatewayStopped")}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={t("office.close")}
                  onClick={closeAgentChat}
                >
                  <X size={15} />
                </button>
              </header>

              {(agentMessages[activeAgent.id] ?? []).length > 0 && (
                <div className="aimashi-agent-chat-messages">
                  {(agentMessages[activeAgent.id] ?? []).map((message) => (
                    <p
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "aimashi-agent-chat-user"
                          : "aimashi-agent-chat-agent"
                      }
                    >
                      {message.text}
                    </p>
                  ))}
                </div>
              )}

              <form
                className="aimashi-agent-chat-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendAgentMessage();
                }}
              >
                <input
                  ref={agentChatInputRef}
                  value={agentChatInput}
                  onChange={(event) => setAgentChatInput(event.target.value)}
                  disabled={Boolean(agentChatLoading[activeAgent.id])}
                  placeholder={
                    activeAgent.gatewayRunning
                      ? `和 ${activeAgent.name} 对话...`
                      : "发送后会自动连接智能体..."
                  }
                />
                <button
                  type="submit"
                  disabled={
                    !agentChatInput.trim() ||
                    Boolean(agentChatLoading[activeAgent.id])
                  }
                >
                  <Send size={16} />
                </button>
              </form>
            </section>
          </>
        )}

        {import.meta.env.DEV && devMode && (
          <div
            style={{
              position: "absolute",
              left: 20,
              bottom: 20,
              maxWidth: 520,
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(20,24,33,0.92)",
              color: "#fbbf24",
              border: "1px solid rgba(245,158,11,0.5)",
              fontSize: 12,
              fontFamily: "monospace",
              lineHeight: 1.5,
              zIndex: 10,
              userSelect: "text",
            }}
          >
            {devLog ??
              "Click a building to pick it up, then click empty ground to move it. Coordinates also log to DevTools console."}
          </div>
        )}

        {selectedAgent && !activeAgent && (
          <aside
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: 300,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "18px 18px 22px",
              background: "var(--card, rgba(20,24,33,0.96))",
              color: "#fff",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "-12px 0 32px rgba(0,0,0,0.28)",
              overflowY: "auto",
              zIndex: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: selectedAgent.color,
                    flex: "0 0 auto",
                  }}
                />
                <span style={{ fontWeight: 700, fontSize: 16 }}>
                  {selectedAgent.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                title={t("office.close")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                alignSelf: "flex-start",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: selectedIsCeo
                  ? "rgba(245,158,11,0.18)"
                  : "rgba(255,255,255,0.08)",
                color: selectedIsCeo ? "#fbbf24" : "rgba(255,255,255,0.85)",
              }}
            >
              {selectedIsCeo && <Crown size={13} />}
              {selectedIsCeo ? t("office.ceo") : t("office.employee")}
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "10px 14px",
                margin: 0,
                fontSize: 13,
              }}
            >
              <dt style={{ opacity: 0.55 }}>{t("office.statusLabel")}</dt>
              <dd
                style={{
                  margin: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: selectedStatusColor,
                  }}
                />
                {t(`office.status_${selectedAgent.status}`)}
              </dd>

              <dt style={{ opacity: 0.55 }}>{t("office.modelLabel")}</dt>
              <dd style={{ margin: 0, wordBreak: "break-word" }}>
                {selectedAgent.model || "—"}
              </dd>

              <dt style={{ opacity: 0.55 }}>{t("office.providerLabel")}</dt>
              <dd style={{ margin: 0, wordBreak: "break-word" }}>
                {selectedAgent.provider || "—"}
              </dd>

              <dt style={{ opacity: 0.55 }}>{t("office.gatewayLabel")}</dt>
              <dd style={{ margin: 0 }}>
                {selectedAgent.gatewayRunning
                  ? t("office.gatewayRunning")
                  : t("office.gatewayStopped")}
              </dd>
            </dl>

            <button
              type="button"
              onClick={() => setCeo(selectedIsCeo ? null : selectedAgent.id)}
              style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 10,
                border: selectedIsCeo
                  ? "1px solid rgba(255,255,255,0.18)"
                  : "1px solid rgba(245,158,11,0.5)",
                background: selectedIsCeo
                  ? "transparent"
                  : "rgba(245,158,11,0.16)",
                color: selectedIsCeo ? "rgba(255,255,255,0.85)" : "#fbbf24",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Crown size={15} />
              {selectedIsCeo ? t("office.removeCeo") : t("office.makeCeo")}
            </button>
          </aside>
        )}

        {!loading && agents.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              opacity: 0.6,
              fontSize: 14,
            }}
          >
            {t("office.noAgents")}
          </div>
        )}
        {avatarLabOpen && <AvatarLab onClose={() => setAvatarLabOpen(false)} />}
      </div>
    </div>
  );
}

export default Office;

