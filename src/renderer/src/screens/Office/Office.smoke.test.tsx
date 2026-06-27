import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Office from "./Office";

const office3dMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  shouldThrow: false,
}));

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    setLocale: vi.fn(),
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.count === "number" ? `${key}:${options.count}` : key,
  }),
}));

vi.mock("./office3d/Office3D", () => ({
  default: (props: Record<string, unknown>) => {
    office3dMock.props = props;
    if (office3dMock.shouldThrow) {
      throw new Error("simulated 3D startup failure");
    }
    return <div data-testid="office3d-ready" />;
  },
}));

vi.mock("../Kanban/Kanban", () => ({
  default: ({ focusTaskId }: { focusTaskId?: string | null }) => (
    <div data-testid="kanban-panel" data-focus-task-id={focusTaskId ?? ""} />
  ),
}));

describe("Office startup smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    office3dMock.props = null;
    office3dMock.shouldThrow = false;
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listProfiles: vi.fn().mockResolvedValue([
          {
            name: "Alpha",
            model: "gpt-test",
            provider: "openai",
            gatewayRunning: false,
          },
        ]),
        createProfile: vi.fn().mockResolvedValue({ success: true }),
        setProfileColor: vi.fn().mockResolvedValue({ success: true }),
        getModelConfig: vi.fn().mockResolvedValue({
          provider: "openai",
          model: "gpt-test",
          baseUrl: "",
        }),
        gatewayStatus: vi.fn().mockResolvedValue(false),
        listModels: vi.fn().mockResolvedValue([]),
        kanbanListTasks: vi.fn().mockResolvedValue({
          success: true,
          data: [],
        }),
        kanbanListClaw3dHqTasks: vi.fn().mockResolvedValue({
          success: true,
          data: [],
        }),
        getSessionMessages: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onChatToolEvent: vi.fn(() => vi.fn()),
      },
    });
  });

  it("renders the office shell and 3D surface with empty startup data", async () => {
    render(<Office visible />);

    expect(await screen.findByTestId("office3d-ready")).toBeInTheDocument();
    expect(screen.getByText("office.title")).toBeInTheDocument();
  });

  it("passes only real profile agents to Office3D when profiles are sparse", async () => {
    render(<Office visible />);

    await screen.findByTestId("office3d-ready");
    await waitFor(() => expect(office3dMock.props).toBeTruthy());

    const officeAgents = office3dMock.props?.agents as Array<{
      id: string;
      sceneOnly?: boolean;
    }>;
    expect(officeAgents).toHaveLength(1);
    expect(officeAgents[0]?.id).toBe("Alpha");
    expect(officeAgents.some((agent) => agent.sceneOnly)).toBe(false);
  });

  it("creates recommended agents as real profiles instead of scene-only actors", async () => {
    const completeProfiles = [
      {
        name: "Alpha",
        model: "gpt-test",
        provider: "openai",
        gatewayRunning: false,
      },
      {
        name: "planner",
        model: "gpt-test",
        provider: "openai",
        gatewayRunning: false,
      },
      {
        name: "researcher",
        model: "gpt-test",
        provider: "openai",
        gatewayRunning: false,
      },
      {
        name: "operator",
        model: "gpt-test",
        provider: "openai",
        gatewayRunning: false,
      },
    ];
    (window.hermesAPI.listProfiles as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          name: "Alpha",
          model: "gpt-test",
          provider: "openai",
          gatewayRunning: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: "Alpha",
          model: "gpt-test",
          provider: "openai",
          gatewayRunning: false,
        },
      ])
      .mockResolvedValueOnce(completeProfiles);

    render(<Office visible />);

    await screen.findByTestId("office3d-ready");
    act(() => {
      screen.getByRole("button", { name: /创建3个真实智能体/ }).click();
    });

    await waitFor(() =>
      expect(window.hermesAPI.createProfile).toHaveBeenCalledTimes(3),
    );
    expect(window.hermesAPI.createProfile).toHaveBeenNthCalledWith(
      1,
      "planner",
      true,
    );
    expect(window.hermesAPI.createProfile).toHaveBeenNthCalledWith(
      2,
      "researcher",
      true,
    );
    expect(window.hermesAPI.createProfile).toHaveBeenNthCalledWith(
      3,
      "operator",
      true,
    );

    await waitFor(() => {
      const officeAgents = office3dMock.props?.agents as Array<{
        id: string;
        sceneOnly?: boolean;
      }>;
      expect(officeAgents.map((agent) => agent.id)).toEqual([
        "Alpha",
        "planner",
        "researcher",
        "operator",
      ]);
      expect(officeAgents.some((agent) => agent.sceneOnly)).toBe(false);
    });
  });

  it("keeps the office UI usable if the 3D scene fails", async () => {
    office3dMock.shouldThrow = true;

    render(<Office visible />);

    expect(
      await screen.findByText("3D scene failed to load"),
    ).toBeInTheDocument();
    expect(screen.getByText("office.title")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open chat" }),
    ).toBeInTheDocument();
  });

  it("does not open agent chat when a workstation screen has no task", async () => {
    render(<Office visible />);

    await screen.findByTestId("office3d-ready");
    await waitFor(() => expect(office3dMock.props).toBeTruthy());

    act(() => {
      (
        office3dMock.props?.onOpenAgentTask as ((agentId: string) => void)
      )("Alpha");
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kanban-panel")).not.toBeInTheDocument();
  });

  it("opens chat for every real profile agent passed to Office3D", async () => {
    window.hermesAPI.listProfiles = vi.fn().mockResolvedValue([
      {
        name: "Alpha",
        model: "gpt-test",
        provider: "openai",
        gatewayRunning: false,
      },
      {
        name: "planner",
        model: "gpt-test",
        provider: "openai",
        gatewayRunning: false,
      },
    ]);

    render(<Office visible />);

    await screen.findByTestId("office3d-ready");
    await waitFor(() => expect(office3dMock.props).toBeTruthy());

    act(() => {
      (office3dMock.props?.onAgentInteract as (agentId: string) => void)(
        "planner",
      );
    });

    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(window.hermesAPI.getSessionMessages).toHaveBeenCalledWith(
      "office-planner",
    );
  });

  it("opens the focused task from a workstation screen", async () => {
    const task = {
      id: "task-1",
      title: "修复屏幕交互",
      assignee: "Alpha",
      status: "running",
      priority: 0,
      created_at: null,
      started_at: null,
    };
    window.hermesAPI.kanbanListTasks = vi.fn().mockResolvedValue({
      success: true,
      data: [task],
    });

    render(<Office visible />);

    await screen.findByTestId("office3d-ready");
    await waitFor(() =>
      expect(
        (office3dMock.props?.agentTaskById as Record<string, unknown>)?.Alpha,
      ).toBeTruthy(),
    );

    act(() => {
      (
        office3dMock.props?.onOpenAgentTask as ((agentId: string) => void)
      )("Alpha");
    });

    expect(await screen.findByTestId("kanban-panel")).toHaveAttribute(
      "data-focus-task-id",
      "task-1",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
