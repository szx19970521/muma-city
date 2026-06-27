import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  LEGACY_RIGGED_EMPLOYEE_URL,
  LEGACY_RIGGED_MAN_URL,
  QUATERNIUS_ANIMATION_LIBRARY_2_URL,
  QUATERNIUS_ANIMATION_LIBRARY_URL,
  RiggedCharacter,
  ROCKETBOX_AGENT_URL,
  type RiggedAnimationClipOverride,
} from "../objects/RiggedCharacter";
import { createAgentAvatarProfileFromSeed } from "../avatars/profile";
import type { RenderAgent } from "../core/types";
import {
  EXTERNAL_ACTION_ASSET_CANDIDATES,
  type ActionAssetCandidate,
} from "./actionAssetPool";

type AvatarLabModelId =
  | "rocketbox"
  | "quaterniusUal1"
  | "quaterniusUal2"
  | "legacyEmployee"
  | "legacyMan";
type AvatarLabCameraMode = "thirdPerson" | "firstPerson";
type AvatarLabMode = "assetPool" | "auditionStage";
type AvatarLabActionCategory = "player" | "agent" | "npc" | "unused";
type AvatarLabRecommendation = "core" | "useful" | "later" | "avoid";
type QuaterniusLibraryId = "ual1" | "ual2";
type AvatarLabActionSource =
  | "all"
  | "rocketbox"
  | "quaternius"
  | "cmu"
  | "rokoko"
  | "mixamo"
  | "unavailable";
type AvatarLabUsageTag =
  | "all"
  | "player"
  | "agent"
  | "npc"
  | "office"
  | "rest"
  | "street"
  | "restaurant";
type AvatarLabAssetStatus = "installed" | "candidate" | "manual" | "blocked";

type AvatarLabAction = {
  id: string;
  state: RenderAgent["state"];
  label: string;
  note: string;
  purpose: string;
  category: AvatarLabActionCategory;
  recommendation: AvatarLabRecommendation;
  walkSpeed?: number;
  rocketboxClip?: RiggedAnimationClipOverride;
  quaterniusClip?: RiggedAnimationClipOverride;
  legacyClip?: RiggedAnimationClipOverride;
  clipName?: string;
  library?: QuaterniusLibraryId;
  raw?: boolean;
  source?: Exclude<AvatarLabActionSource, "all">;
  usageTags?: Exclude<AvatarLabUsageTag, "all">[];
  assetStatus?: AvatarLabAssetStatus;
  licenseNote?: string;
  packagingNote?: string;
  previewNote?: string;
};

type AvatarLabActionGroup = {
  id: string;
  label: string;
  description: string;
  actions: AvatarLabAction[];
};

type OfficeFit = {
  label: string;
  tone: "good" | "partial" | "bad";
  detail: string;
};

const CATEGORY_LABEL: Record<AvatarLabActionCategory, string> = {
  player: "玩家",
  agent: "智能体",
  npc: "NPC",
  unused: "无关动作",
};

const RECOMMENDATION_LABEL: Record<AvatarLabRecommendation, string> = {
  core: "核心候选",
  useful: "可用",
  later: "后续再看",
  avoid: "不建议",
};

const CATEGORY_ORDER: AvatarLabActionCategory[] = [
  "player",
  "agent",
  "npc",
  "unused",
];

const SOURCE_LABEL: Record<AvatarLabActionSource, string> = {
  all: "全部来源",
  rocketbox: "Rocketbox",
  quaternius: "Quaternius",
  cmu: "CMU",
  rokoko: "Rokoko",
  mixamo: "Mixamo候选",
  unavailable: "不可用",
};

const USAGE_LABEL: Record<AvatarLabUsageTag, string> = {
  all: "全部用途",
  player: "玩家",
  agent: "智能体",
  npc: "NPC",
  office: "办公",
  rest: "休息",
  street: "街道",
  restaurant: "餐厅",
};

const ASSET_STATUS_LABEL: Record<AvatarLabAssetStatus, string> = {
  installed: "已安装",
  candidate: "候选",
  manual: "需人工精选",
  blocked: "暂不纳入",
};

const SOURCE_ORDER: AvatarLabActionSource[] = [
  "all",
  "rocketbox",
  "quaternius",
  "cmu",
  "rokoko",
  "mixamo",
  "unavailable",
];

const USAGE_ORDER: AvatarLabUsageTag[] = [
  "all",
  "player",
  "agent",
  "npc",
  "office",
  "rest",
  "street",
  "restaurant",
];

const MODEL_OPTIONS: Array<{
  id: AvatarLabModelId;
  label: string;
  description: string;
  status: "ready" | "experimental";
}> = [
  {
    id: "rocketbox",
    label: "Microsoft Rocketbox",
    description:
      "MIT，真人比例，适合智能体方向验证；动作少，但角色比例更接近现实。",
    status: "ready",
  },
  {
    id: "quaterniusUal1",
    label: "Quaternius UAL1 Standard",
    description:
      "CC0 免费标准包，已索引 46 个动作。适合走路、坐下、对话、交互实验；没有现成键盘鼠标办公动作。",
    status: "ready",
  },
  {
    id: "quaterniusUal2",
    label: "Quaternius UAL2 Standard",
    description:
      "CC0 免费标准包，已索引 43 个动作。补充手持走路、电话、点头、生活化动作；仍没有现成键盘鼠标办公动作。",
    status: "ready",
  },
  {
    id: "legacyEmployee",
    label: "Legacy Employee",
    description:
      "本地旧 GLB，保留作低风险对照，不建议继续作为最终人物路线。",
    status: "experimental",
  },
  {
    id: "legacyMan",
    label: "Legacy Man",
    description:
      "本地旧 GLB，有站立、坐下、走路等动作，仅用于和新资源做风格对比。",
    status: "experimental",
  },
];

const CORE_ACTION_OPTIONS: AvatarLabAction[] = [
  {
    id: "idle",
    state: "standing",
    label: "站立待机",
    note: "基础 idle，用来检查模型比例、材质和骨骼方向。",
    purpose: "玩家、智能体、NPC 都需要的基础姿态。",
    category: "player",
    recommendation: "core",
    quaterniusClip: "Idle_Loop",
    legacyClip: "idle",
  },
  {
    id: "walk",
    state: "walking",
    label: "走路",
    note: "检查步态、抖动和朝向稳定性。",
    purpose: "玩家第三视角移动、智能体巡航、街上 NPC 通勤。",
    category: "player",
    recommendation: "core",
    walkSpeed: 1.4,
    quaterniusClip: "Walk_Loop",
    legacyClip: "walk",
  },
  {
    id: "run",
    state: "walking",
    label: "跑步",
    note: "玩家快速移动候选。已检查 Sprint_Loop 的腿部骨骼旋转轨道，不是只靠平移。",
    purpose: "玩家第三视角快速移动；智能体和普通 NPC 暂不作为默认动作。",
    category: "player",
    recommendation: "core",
    walkSpeed: 3.2,
    quaterniusClip: "Sprint_Loop",
    legacyClip: "sprint",
  },
  {
    id: "jog",
    state: "walking",
    label: "慢跑（非 run）",
    note: "比走路快，但不把它当作正式 run；正式 run 使用 Sprint_Loop。",
    purpose: "可作为玩家轻快移动或智能体快速回工位的后续候选。",
    category: "player",
    recommendation: "useful",
    walkSpeed: 2.2,
    quaterniusClip: "Jog_Fwd_Loop",
    legacyClip: "sprint",
  },
  {
    id: "sit",
    state: "sitting",
    label: "坐下",
    note: "检查椅子高度和穿模风险。",
    purpose: "智能体工位、休息区、玩家第三视角坐姿的基础候选。",
    category: "agent",
    recommendation: "core",
    quaterniusClip: "Sitting_Idle_Loop",
    legacyClip: "sit",
  },
  {
    id: "desk",
    state: "working_at_desk",
    label: "工位办公（需组合）",
    note: "Quaternius 免费包没有真正的键盘鼠标办公动作；这里暂用坐姿作底层，后续需要叠加上半身/手部办公动作或另找专门办公资产。",
    purpose: "只能验证坐在工位的身体比例和椅子高度，不能单独满足“手放在键盘鼠标上”。",
    category: "agent",
    recommendation: "core",
    quaterniusClip: "Sitting_Idle_Loop",
    clipName: "Sitting_Idle_Loop",
    library: "ual1",
  },
  {
    id: "talk",
    state: "talking_to_player",
    label: "对话",
    note: "说话 idle，用来验证面对玩家、智能体交流和 NPC 问候。",
    purpose: "玩家和智能体对话、智能体之间交流、街上 NPC 简单互动。",
    category: "npc",
    recommendation: "core",
    quaterniusClip: "Idle_Talking_Loop",
  },
  {
    id: "interact",
    state: "using_tools",
    label: "交互/按按钮",
    note: "通用交互动作，适合按钮、终端、工具柜等目标。",
    purpose: "可用于打开工具室柜子、点击屏幕、按门禁或设备按钮。",
    category: "player",
    recommendation: "core",
    quaterniusClip: "Interact",
  },
  {
    id: "pickup",
    state: "using_memory",
    label: "拿取桌面物品",
    note: "从桌面高度拿东西，适合先做资料册、任务卡、平板拿取。",
    purpose: "可用于拿资料册、任务卡、平板，不适合捡地面小物件。",
    category: "player",
    recommendation: "core",
    quaterniusClip: "PickUp_Table",
  },
  {
    id: "push",
    state: "opening_door",
    label: "推门/推动",
    note: "循环推动作，可作为开门和推柜子的候选。",
    purpose: "可用于室内门、公司门、工具柜或开关设备的动作反馈。",
    category: "player",
    recommendation: "useful",
    quaterniusClip: "Push_Loop",
  },
  {
    id: "jump",
    state: "standing",
    label: "跳跃",
    note: "用于检查第三视角跳跃姿态，后续可分起跳、滞空、落地。",
    purpose: "玩家第三视角需要，智能体和普通 NPC 通常不用。",
    category: "player",
    recommendation: "useful",
    quaterniusClip: "Jump_Start",
    legacyClip: "jump",
  },
  {
    id: "crouch",
    state: "standing",
    label: "蹲伏",
    note: "可作为拾取低处物体和检查柜子下层的候选。",
    purpose: "可用于地面拾取、低处查看；办公游戏里不是高频核心动作。",
    category: "player",
    recommendation: "later",
    quaterniusClip: "Crouch_Idle_Loop",
  },
  {
    id: "dance",
    state: "dancing",
    label: "情绪动作",
    note: "用来观察动作自然度上限，不建议优先接主玩法。",
    purpose: "可作为庆祝、休息区彩蛋；不建议用于常规办公互动。",
    category: "unused",
    recommendation: "later",
    quaterniusClip: "Dance_Loop",
  },
];

export type AvatarLabRoleKey = "player" | "agent" | "npc";

type AvatarLabRecommendedActionRow = {
  role: AvatarLabRoleKey;
  roleLabel: string;
  actionId: string;
  label: string;
  source: Exclude<AvatarLabActionSource, "all">;
  status: AvatarLabAssetStatus;
  recommendation: AvatarLabRecommendation;
  purpose: string;
  validation: string;
  caveat: string;
};

type AvatarLabAvoidActionRow = {
  actionId: string;
  label: string;
  source: Exclude<AvatarLabActionSource, "all">;
  reason: string;
};

type QuaterniusPlayerActionVerificationRow = {
  actionId: string;
  label: string;
  clipName: string;
  purpose: string;
  labStatus: "verified" | "partial" | "gap";
  connectDecision: "ready_for_character_pipeline" | "lab_only" | "do_not_connect";
  legMotionVerified?: boolean;
  evidence: string;
};

type AvatarLabActionGapRow = {
  id: string;
  label: string;
  missing: string;
  recommendation: string;
};

type AvatarLabAuditionActor = "player" | "agent";
type AvatarLabAuditionDecision = "candidate" | "lab_only" | "avoid";

type AvatarLabAuditionVector = [number, number, number];

type AvatarLabAuditionStep = {
  label: string;
  durationMs: number;
  playerClip?: RiggedAnimationClipOverride;
  playerLibrary?: QuaterniusLibraryId;
  agentClip?: RiggedAnimationClipOverride;
  playerFrom?: AvatarLabAuditionVector;
  playerTo?: AvatarLabAuditionVector;
  agentFrom?: AvatarLabAuditionVector;
  agentTo?: AvatarLabAuditionVector;
  playerYaw?: number;
  agentYaw?: number;
};

type AvatarLabAuditionChain = {
  id: string;
  label: string;
  actor: AvatarLabAuditionActor;
  purpose: string;
  decision: AvatarLabAuditionDecision;
  decisionNote: string;
  playerLibrary?: QuaterniusLibraryId;
  loop?: boolean;
  steps: AvatarLabAuditionStep[];
};

type AvatarLabManualAuditionAvailability = {
  canAudition: boolean;
  reason: string;
};

type AvatarLabAuditionCollider = {
  id: string;
  label: string;
  center: [number, number];
  size: [number, number];
};

type AvatarLabCollisionResult = {
  position: AvatarLabAuditionVector;
  hitLabels: string[];
};

const QUATERNIUS_LICENSE_NOTE =
  "Quaternius UAL1/UAL2 为 CC0 1.0，已保留本地 License.txt；仍需在资源登记里记录来源。";
const ROCKETBOX_LICENSE_NOTE =
  "Microsoft Rocketbox 为 MIT License，已保留 LICENSE.md；可用于实验室预览和后续精选集成。";

const ROCKETBOX_INSTALLED_ACTIONS: AvatarLabAction[] = [
  {
    id: "rbx:idle-neutral",
    state: "standing",
    label: "自然站立",
    note: "Rocketbox 已安装动作：f_idle_neutral_01.max.fbx",
    purpose: "智能体和 NPC 的真人比例待机，用来检查角色比例、材质和办公风格。",
    category: "npc",
    recommendation: "core",
    rocketboxClip: "idle",
    source: "rocketbox",
    usageTags: ["player", "agent", "npc", "office", "street"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "已作为实验室预览资产加载；后续接主场景前仍需人工截图验收。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
  {
    id: "rbx:walk-neutral",
    state: "walking",
    label: "自然走路",
    note: "Rocketbox 已安装动作：f_walk_neutral.max.fbx",
    purpose: "智能体巡航、办公室 NPC 走动和街道低速通勤的真人比例步态候选。",
    category: "agent",
    recommendation: "core",
    walkSpeed: 1.2,
    rocketboxClip: "walk",
    source: "rocketbox",
    usageTags: ["player", "agent", "npc", "office", "street"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "已在 RiggedCharacter 内稳定根位移，避免预览时角色漂走。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
  {
    id: "rbx:sit-chair",
    state: "sitting",
    label: "椅子坐姿",
    note: "Rocketbox 已安装动作：f_sit_chair_breathe_01.max.fbx",
    purpose: "智能体工位、会议室和休息区坐姿底层；可验证椅子高度和身体比例。",
    category: "agent",
    recommendation: "core",
    rocketboxClip: "sit_chair",
    source: "rocketbox",
    usageTags: ["agent", "npc", "office", "rest"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "仅作为坐姿底层，不代表键盘鼠标手部已经对齐。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
  {
    id: "rbx:work-table",
    state: "using_tools",
    label: "桌边操作",
    note: "Rocketbox 已安装动作：f_work_table.max.fbx",
    purpose: "可用于站立桌边、工具台、文件柜或设备检查，不直接等同工位打字。",
    category: "agent",
    recommendation: "useful",
    rocketboxClip: "work_table",
    source: "rocketbox",
    usageTags: ["agent", "npc", "office"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "需要和桌面高度、手部接触点一起校准后才能进入正式场景。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
  {
    id: "rbx:gestic-talk",
    state: "talking_to_player",
    label: "手势交谈",
    note: "Rocketbox 已安装动作：f_gestic_talk_neutral_01.max.fbx",
    purpose: "智能体面向玩家说明、NPC 问候、办公室短对话的核心候选。",
    category: "npc",
    recommendation: "core",
    rocketboxClip: "gestic_talk",
    source: "rocketbox",
    usageTags: ["player", "agent", "npc", "office", "street", "rest"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "适合先做交流反馈；正式接入前需验收视线、朝向和遮挡。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
  {
    id: "rbx:try-door",
    state: "opening_door",
    label: "试门/推门",
    note: "Rocketbox 已安装动作：f_try_door_inwards.max.fbx",
    purpose: "开门、门禁、工具柜互动的候选动作；只在实验室验证，不接门状态机。",
    category: "player",
    recommendation: "useful",
    rocketboxClip: "try_door",
    source: "rocketbox",
    usageTags: ["player", "agent", "npc", "office"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "不能直接接主场景门；需由门状态机专项窗口统一处理。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
  {
    id: "rbx:knock-door",
    state: "opening_door",
    label: "敲门",
    note: "Rocketbox 已安装动作：f_knock_door.max.fbx",
    purpose: "访客、会议室、办公室门前等待的 NPC 氛围动作候选。",
    category: "npc",
    recommendation: "useful",
    rocketboxClip: "knock_door",
    source: "rocketbox",
    usageTags: ["agent", "npc", "office"],
    assetStatus: "installed",
    licenseNote: ROCKETBOX_LICENSE_NOTE,
    packagingNote: "只做角色动作筛选；不改变主场景门、碰撞或传感器逻辑。",
    previewNote: "可在 Rocketbox 模型下直接预览。",
  },
];

export const ROCKETBOX_INSTALLED_ACTION_IDS = ROCKETBOX_INSTALLED_ACTIONS.map(
  (action) => action.id,
);

export const AVATAR_LAB_ROLE_CORE_ACTION_IDS: Record<
  AvatarLabRoleKey,
  readonly string[]
> = {
  player: [
    "q1:Idle_Loop",
    "q1:Walk_Loop",
    "q1:Sprint_Loop",
    "q1:Interact",
    "q1:PickUp_Table",
    "q1:Push_Loop",
    "q1:Jump_Start",
    "q1:Jump_Loop",
    "q1:Jump_Land",
    "q2:Walk_Carry_Loop",
    "rbx:try-door",
  ],
  agent: [
    "rbx:idle-neutral",
    "rbx:walk-neutral",
    "rbx:sit-chair",
    "rbx:work-table",
    "rbx:gestic-talk",
    "q1:Walk_Formal_Loop",
    "q1:Sitting_Idle_Loop",
    "q1:Sitting_Talking_Loop",
    "q2:Idle_TalkingPhone_Loop",
    "mixamo:typing",
  ],
  npc: [
    "rbx:idle-neutral",
    "rbx:walk-neutral",
    "rbx:gestic-talk",
    "rbx:knock-door",
    "q1:Idle_Talking_Loop",
    "q2:Idle_FoldArms_Loop",
    "q2:Idle_TalkingPhone_Loop",
    "q2:Consume",
    "rokoko:everyday-idle",
  ],
};

export const QUATERNIUS_PLAYER_ACTION_VERIFICATION_TABLE: readonly QuaterniusPlayerActionVerificationRow[] =
  [
    {
      actionId: "q1:Idle_Loop",
      label: "站立待机",
      clipName: "Idle_Loop",
      purpose: "玩家第三视角默认站姿，用于检查模型比例、材质、骨骼朝向和静止呼吸感。",
      labStatus: "verified",
      connectDecision: "ready_for_character_pipeline",
      evidence: "UAL1 已安装并可在 Quaternius 玩家模型下预览。",
    },
    {
      actionId: "q1:Walk_Loop",
      label: "走路",
      clipName: "Walk_Loop",
      purpose: "玩家第三视角基础移动，用于验收步态、脚底滑动和朝向稳定性。",
      labStatus: "verified",
      connectDecision: "ready_for_character_pipeline",
      legMotionVerified: true,
      evidence: "UAL1 GLB 里 Walk_Loop 含大腿、小腿、脚、脚趾动画轨道。",
    },
    {
      actionId: "q1:Sprint_Loop",
      label: "跑步",
      clipName: "Sprint_Loop",
      purpose: "玩家快速移动候选；智能体和普通 NPC 不默认使用。",
      labStatus: "verified",
      connectDecision: "ready_for_character_pipeline",
      legMotionVerified: true,
      evidence:
        "资产检查确认 Sprint_Loop 有 24 条腿部相关轨道，大腿/小腿/脚 quaternion 关键帧有明显变化，不是平移假跑。",
    },
    {
      actionId: "q1:Jump_Start/q1:Jump_Loop/q1:Jump_Land",
      label: "跳跃",
      clipName: "Jump_Start + Jump_Loop + Jump_Land",
      purpose: "玩家第三视角跳跃资源候选，适合拆成起跳、滞空、落地三段。",
      labStatus: "partial",
      connectDecision: "lab_only",
      legMotionVerified: true,
      evidence:
        "三段资源存在，Jump_Start 腿部轨道有关键帧变化；但实验室当前只按单 clip 预览，尚未验证跳跃状态机衔接。",
    },
    {
      actionId: "q1:Interact",
      label: "交互/按按钮",
      clipName: "Interact",
      purpose: "玩家按按钮、操作终端、打开工具柜的通用交互候选。",
      labStatus: "verified",
      connectDecision: "ready_for_character_pipeline",
      evidence: "UAL1 已安装并可在 Quaternius 玩家模型下预览；仍需按具体道具校准手部接触点。",
    },
  ] as const;

export const AVATAR_LAB_CONNECTABLE_ACTION_TABLE =
  QUATERNIUS_PLAYER_ACTION_VERIFICATION_TABLE.filter(
    (row) => row.connectDecision === "ready_for_character_pipeline",
  );

export const AVATAR_LAB_ACTION_GAPS: readonly AvatarLabActionGapRow[] = [
  {
    id: "quaternius:office-keyboard-mouse",
    label: "Quaternius 工位办公动作",
    missing: "免费 UAL1/UAL2 未发现坐在工位、双手精准放键盘鼠标的现成动作。",
    recommendation:
      "不要硬凑；继续作为缺口记录，后续用上半身/手部层动画或人工精选办公动作补齐。",
  },
  {
    id: "quaternius:jump-state-machine",
    label: "玩家完整跳跃衔接",
    missing: "资源有 Jump_Start、Jump_Loop、Jump_Land，但实验室当前没有验证三段状态切换。",
    recommendation:
      "留在实验室继续做分段预览和人工验收，暂不接 PlayerThirdPersonCharacter。",
  },
] as const;

export const AVATAR_LAB_AUDITION_CHAINS: readonly AvatarLabAuditionChain[] = [
  {
    id: "player-walk",
    label: "玩家走路",
    actor: "player",
    purpose: "验证玩家第三视角基础移动、朝向和脚底滑动。",
    decision: "candidate",
    decisionNote: "Quaternius UAL1 已安装，Walk_Loop 可作为玩家移动候选。",
    steps: [
      {
        label: "站稳准备",
        durationMs: 500,
        playerClip: "Idle_Loop",
        playerFrom: [-1.4, 0, 0.7],
        playerTo: [-1.4, 0, 0.7],
        playerYaw: -0.32,
      },
      {
        label: "走向办公桌",
        durationMs: 1800,
        playerClip: "Walk_Loop",
        playerFrom: [-1.4, 0, 0.7],
        playerTo: [-0.35, 0, 0.05],
        playerYaw: -0.52,
      },
      {
        label: "停在桌边",
        durationMs: 500,
        playerClip: "Idle_Loop",
        playerFrom: [-0.35, 0, 0.05],
        playerTo: [-0.35, 0, 0.05],
        playerYaw: -0.52,
      },
    ],
  },
  {
    id: "player-run",
    label: "玩家跑步",
    actor: "player",
    purpose: "验证 Shift 跑步语义使用 Sprint_Loop，腿部骨骼真实运动。",
    decision: "candidate",
    decisionNote: "Sprint_Loop 已在实验室测试确认腿会动，可进入玩家角色管线候选。",
    steps: [
      {
        label: "起跑准备",
        durationMs: 450,
        playerClip: "Idle_Loop",
        playerFrom: [-1.65, 0, 1],
        playerTo: [-1.65, 0, 1],
        playerYaw: -0.7,
      },
      {
        label: "冲向门口",
        durationMs: 1300,
        playerClip: "Sprint_Loop",
        playerFrom: [-1.65, 0, 1],
        playerTo: [0.7, 0, -0.55],
        playerYaw: -0.82,
      },
      {
        label: "减速停下",
        durationMs: 550,
        playerClip: "Walk_Loop",
        playerFrom: [0.7, 0, -0.55],
        playerTo: [1.05, 0, -0.72],
        playerYaw: -0.82,
      },
      {
        label: "站定",
        durationMs: 450,
        playerClip: "Idle_Loop",
        playerFrom: [1.05, 0, -0.72],
        playerTo: [1.05, 0, -0.72],
        playerYaw: -0.82,
      },
    ],
  },
  {
    id: "player-jump",
    label: "玩家跳跃",
    actor: "player",
    purpose: "验证 Quaternius 跳跃三段资源是否能组成玩家跳跃链。",
    decision: "lab_only",
    decisionNote: "资源存在，但主场景跳跃状态机未在试演场完成验证，暂不建议接。",
    steps: [
      {
        label: "起跳准备",
        durationMs: 400,
        playerClip: "Idle_Loop",
        playerFrom: [-0.95, 0, 0.65],
        playerTo: [-0.95, 0, 0.65],
        playerYaw: -0.25,
      },
      {
        label: "起跳",
        durationMs: 520,
        playerClip: "Jump_Start",
        playerFrom: [-0.95, 0, 0.65],
        playerTo: [-0.8, 0.22, 0.38],
        playerYaw: -0.25,
      },
      {
        label: "滞空",
        durationMs: 520,
        playerClip: "Jump_Loop",
        playerFrom: [-0.8, 0.22, 0.38],
        playerTo: [-0.58, 0.22, 0.08],
        playerYaw: -0.25,
      },
      {
        label: "落地",
        durationMs: 620,
        playerClip: "Jump_Land",
        playerFrom: [-0.58, 0.22, 0.08],
        playerTo: [-0.42, 0, -0.08],
        playerYaw: -0.25,
      },
      {
        label: "恢复站姿",
        durationMs: 450,
        playerClip: "Idle_Loop",
        playerFrom: [-0.42, 0, -0.08],
        playerTo: [-0.42, 0, -0.08],
        playerYaw: -0.25,
      },
    ],
  },
  {
    id: "player-click-computer",
    label: "玩家点击电脑",
    actor: "player",
    purpose: "验证玩家走到工位、面向电脑并执行通用交互动作。",
    decision: "candidate",
    decisionNote: "Walk_Loop + Interact 可作为低风险交互链候选，仍需主场景道具对齐验收。",
    steps: [
      {
        label: "走到电脑前",
        durationMs: 1500,
        playerClip: "Walk_Loop",
        playerFrom: [-1.2, 0, 0.4],
        playerTo: [-0.28, 0, -0.12],
        playerYaw: -0.55,
      },
      {
        label: "点击屏幕",
        durationMs: 950,
        playerClip: "Interact",
        playerFrom: [-0.28, 0, -0.12],
        playerTo: [-0.28, 0, -0.12],
        playerYaw: -0.55,
      },
      {
        label: "回到待机",
        durationMs: 500,
        playerClip: "Idle_Loop",
        playerFrom: [-0.28, 0, -0.12],
        playerTo: [-0.28, 0, -0.12],
        playerYaw: -0.55,
      },
    ],
  },
  {
    id: "player-pickup-folder",
    label: "玩家拿资料册",
    actor: "player",
    purpose: "验证玩家靠近书架/桌边并从桌面高度拿资料册。",
    decision: "candidate",
    decisionNote: "PickUp_Table 适合桌面高度资料册，不适合地面拾取。",
    steps: [
      {
        label: "走向书架",
        durationMs: 1300,
        playerClip: "Walk_Loop",
        playerFrom: [-1.35, 0, -0.15],
        playerTo: [-0.95, 0, -0.9],
        playerYaw: 0.18,
      },
      {
        label: "拿资料册",
        durationMs: 1000,
        playerClip: "PickUp_Table",
        playerFrom: [-0.95, 0, -0.9],
        playerTo: [-0.95, 0, -0.9],
        playerYaw: 0.18,
      },
      {
        label: "抱着资料转身",
        durationMs: 750,
        playerClip: "Walk_Carry_Loop",
        playerFrom: [-0.95, 0, -0.9],
        playerTo: [-0.55, 0, -0.55],
        playerYaw: -0.45,
      },
    ],
  },
  {
    id: "player-talk",
    label: "玩家对话",
    actor: "player",
    purpose: "验证玩家靠近智能体后进入对话姿态。",
    decision: "candidate",
    decisionNote: "玩家使用 Idle_Talking_Loop，智能体用 Rocketbox 手势交谈，适合继续人工验收。",
    steps: [
      {
        label: "走近智能体",
        durationMs: 1100,
        playerClip: "Walk_Loop",
        agentClip: "idle",
        playerFrom: [-1.1, 0, 0.45],
        playerTo: [-0.35, 0, 0.35],
        playerYaw: 0.85,
        agentYaw: -1.95,
      },
      {
        label: "玩家发起对话",
        durationMs: 1200,
        playerClip: "Idle_Talking_Loop",
        agentClip: "gestic_talk",
        playerFrom: [-0.35, 0, 0.35],
        playerTo: [-0.35, 0, 0.35],
        playerYaw: 0.85,
        agentYaw: -1.95,
      },
      {
        label: "对话收束",
        durationMs: 600,
        playerClip: "Idle_Loop",
        agentClip: "idle",
        playerFrom: [-0.35, 0, 0.35],
        playerTo: [-0.35, 0, 0.35],
        playerYaw: 0.85,
        agentYaw: -1.95,
      },
    ],
  },
  {
    id: "agent-work",
    label: "智能体坐下工作",
    actor: "agent",
    purpose: "验证智能体到工位、坐下并进入办公占位动作。",
    decision: "lab_only",
    decisionNote: "Rocketbox 坐姿稳定，但缺少真实键鼠手部办公动作，暂不建议直接接主场景。",
    steps: [
      {
        label: "走到椅子旁",
        durationMs: 1300,
        agentClip: "walk",
        agentFrom: [0.95, 0, 0.62],
        agentTo: [0.35, 0, -0.1],
        agentYaw: 2.65,
      },
      {
        label: "坐下待机",
        durationMs: 1200,
        agentClip: "sit_chair",
        agentFrom: [0.35, 0, -0.1],
        agentTo: [0.35, 0, -0.1],
        agentYaw: Math.PI,
      },
      {
        label: "桌边工作占位",
        durationMs: 1200,
        agentClip: "work_table",
        agentFrom: [0.35, 0, -0.1],
        agentTo: [0.35, 0, -0.1],
        agentYaw: Math.PI,
      },
    ],
  },
  {
    id: "agent-talk",
    label: "智能体起身对话",
    actor: "agent",
    purpose: "验证智能体从工位状态转为面对玩家的解释/对话动作。",
    decision: "candidate",
    decisionNote: "Rocketbox gestic_talk 可作为智能体对话候选，坐姿到站姿衔接仍需人工验收。",
    steps: [
      {
        label: "坐姿结束",
        durationMs: 650,
        agentClip: "sit_chair",
        agentFrom: [0.35, 0, -0.1],
        agentTo: [0.35, 0, -0.1],
        agentYaw: Math.PI,
      },
      {
        label: "站起调整",
        durationMs: 700,
        agentClip: "idle",
        agentFrom: [0.35, 0, -0.1],
        agentTo: [0.25, 0, 0.1],
        agentYaw: -1.95,
      },
      {
        label: "面向玩家说明",
        durationMs: 1400,
        agentClip: "gestic_talk",
        playerClip: "Idle_Talking_Loop",
        agentFrom: [0.25, 0, 0.1],
        agentTo: [0.25, 0, 0.1],
        agentYaw: -1.95,
        playerYaw: 0.85,
      },
    ],
  },
  {
    id: "agent-open-door",
    label: "智能体开门",
    actor: "agent",
    purpose: "验证智能体走到门边并播放开门候选动作。",
    decision: "lab_only",
    decisionNote: "只验证角色动作；主场景门状态机和碰撞不在本窗口接入。",
    steps: [
      {
        label: "走到门边",
        durationMs: 1500,
        agentClip: "walk",
        agentFrom: [0.2, 0, 0.55],
        agentTo: [1.25, 0, -0.78],
        agentYaw: -0.85,
      },
      {
        label: "尝试开门",
        durationMs: 1200,
        agentClip: "try_door",
        agentFrom: [1.25, 0, -0.78],
        agentTo: [1.25, 0, -0.78],
        agentYaw: -0.85,
      },
      {
        label: "等待门响应",
        durationMs: 650,
        agentClip: "idle",
        agentFrom: [1.25, 0, -0.78],
        agentTo: [1.25, 0, -0.78],
        agentYaw: -0.85,
      },
    ],
  },
  {
    id: "agent-research",
    label: "智能体查资料",
    actor: "agent",
    purpose: "验证智能体走向书架、执行资料查找和回到对话状态。",
    decision: "lab_only",
    decisionNote: "Rocketbox 没有精准书架检索动作，当前用 walk + work_table 代替，暂不建议接主场景。",
    steps: [
      {
        label: "走向书架",
        durationMs: 1200,
        agentClip: "walk",
        agentFrom: [0.35, 0, 0.25],
        agentTo: [-0.85, 0, -0.78],
        agentYaw: 0.35,
      },
      {
        label: "查找资料",
        durationMs: 1400,
        agentClip: "work_table",
        agentFrom: [-0.85, 0, -0.78],
        agentTo: [-0.85, 0, -0.78],
        agentYaw: 0.35,
      },
      {
        label: "带回结论",
        durationMs: 1000,
        agentClip: "gestic_talk",
        agentFrom: [-0.85, 0, -0.78],
        agentTo: [-0.35, 0, 0.18],
        agentYaw: -1.7,
      },
    ],
  },
] as const;

export const AVATAR_LAB_AUDITION_CONNECTABLE_CHAINS =
  AVATAR_LAB_AUDITION_CHAINS.filter((chain) => chain.decision === "candidate");

export const AVATAR_LAB_AUDITION_NOT_RECOMMENDED_CHAINS =
  AVATAR_LAB_AUDITION_CHAINS.filter((chain) => chain.decision !== "candidate");

export function getAllAvatarLabActions(): AvatarLabAction[] {
  return [
    ...ROCKETBOX_INSTALLED_ACTIONS,
    ...QUATERNIUS_UAL1_RAW_ACTIONS,
    ...QUATERNIUS_UAL2_RAW_ACTIONS,
    ...EXTERNAL_CANDIDATE_ACTIONS,
  ];
}

function getActionLibrary(action: AvatarLabAction): QuaterniusLibraryId {
  return action.library ?? (action.id.startsWith("q2:") ? "ual2" : "ual1");
}

export function createQueueAuditionChain(
  playerActions: readonly AvatarLabAction[],
  agentActions: readonly AvatarLabAction[],
): AvatarLabAuditionChain {
  const steps: AvatarLabAuditionStep[] = [
    {
      label: "队列准备",
      durationMs: 650,
      playerClip: "Idle_Loop",
      playerLibrary: "ual1",
      playerFrom: [-0.88, 0, 0.74],
      playerTo: [-0.88, 0, 0.74],
      playerYaw: -0.35,
      agentClip: "idle",
      agentFrom: [0.72, 0, 0.72],
      agentTo: [0.72, 0, 0.72],
      agentYaw: 2.65,
    },
  ];

  const validPlayerActions = playerActions.filter(
    (action) => getManualAuditionAvailability(action, "player").canAudition,
  );
  const validAgentActions = agentActions.filter(
    (action) => getManualAuditionAvailability(action, "agent").canAudition,
  );

  validPlayerActions.forEach((action, index) => {
    const moving = action.state === "walking";
    const startX = -1.05 + (index % 2) * 0.18;
    const endX = moving ? -0.28 : startX;
    const z = 0.82 - (index % 3) * 0.12;
    steps.push({
      label: `玩家 ${index + 1}: ${action.label}`,
      durationMs: moving ? 1900 : 1550,
      playerClip: action.quaterniusClip,
      playerLibrary: getActionLibrary(action),
      playerFrom: [startX, 0, z],
      playerTo: [endX, 0, moving ? 0.62 : z],
      playerYaw: moving ? -0.9 : -0.35,
      agentClip: "idle",
      agentFrom: [0.72, 0, 0.72],
      agentTo: [0.72, 0, 0.72],
      agentYaw: 2.65,
    });
  });

  validAgentActions.forEach((action, index) => {
    const moving = action.state === "walking";
    const startX = 0.92 - (index % 2) * 0.12;
    const endX = moving ? 0.24 : startX;
    const z = 0.76 - (index % 3) * 0.1;
    steps.push({
      label: `智能体 ${index + 1}: ${action.label}`,
      durationMs: moving ? 1900 : 1650,
      playerClip: "Idle_Loop",
      playerLibrary: "ual1",
      playerFrom: [-0.88, 0, 0.74],
      playerTo: [-0.88, 0, 0.74],
      playerYaw: -0.35,
      agentClip: action.rocketboxClip,
      agentFrom: [startX, 0, z],
      agentTo: [endX, 0, moving ? 0.58 : z],
      agentYaw: moving ? 1.25 : 2.65,
    });
  });

  if (steps.length === 1) {
    steps.push({
      label: "等待选择动作",
      durationMs: 1200,
      playerClip: "Idle_Loop",
      playerLibrary: "ual1",
      playerFrom: [-0.88, 0, 0.74],
      playerTo: [-0.88, 0, 0.74],
      playerYaw: -0.35,
      agentClip: "idle",
      agentFrom: [0.72, 0, 0.72],
      agentTo: [0.72, 0, 0.72],
      agentYaw: 2.65,
    });
  }

  return {
    id: "manual-queue",
    label: "手动动作队列",
    actor: validPlayerActions.length > 0 ? "player" : "agent",
    purpose: `玩家 ${validPlayerActions.length} 个，智能体 ${validAgentActions.length} 个；右键动作加入队列后循环试演。`,
    decision: "lab_only",
    decisionNote: "实验室手动队列，只生成待同步动作集，不直接写入主场景。",
    playerLibrary: "ual1",
    loop: false,
    steps,
  };
}

export function createFocusedAuditionChain(
  actor: AvatarLabAuditionActor,
  action: AvatarLabAction | null,
  revision = 0,
): AvatarLabAuditionChain {
  if (!action || !getManualAuditionAvailability(action, actor).canAudition) {
    return {
      id: `focused-empty:${revision}`,
      label: "等待选择动作",
      actor,
      purpose: "请选择左侧动作，或点击右上动作标签预览。",
      decision: "lab_only",
      decisionNote: "实验室内预览，不接主场景。",
      playerLibrary: "ual1",
      loop: false,
      steps: [
        {
          label: "等待选择动作",
          durationMs: 1200,
          playerClip: "Idle_Loop",
          playerLibrary: "ual1",
          playerFrom: [-0.88, 0, 0.74],
          playerTo: [-0.88, 0, 0.74],
          playerYaw: -0.35,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.65,
        },
      ],
    };
  }

  const moving = action.state === "walking";
  if (actor === "player") {
    const start: AvatarLabAuditionVector = moving ? [-1.04, 0, 0.84] : [-0.88, 0, 0.74];
    const end: AvatarLabAuditionVector = moving ? [-0.28, 0, 0.62] : start;
    return {
      id: `focused-player:${action.id}:${revision}`,
      label: `玩家动作：${action.label}`,
      actor: "player",
      purpose: action.purpose,
      decision: "lab_only",
      decisionNote: "实验室内单动作预览，不接主场景。",
      playerLibrary: getActionLibrary(action),
      loop: false,
      steps: [
        {
          label: "准备",
          durationMs: 220,
          playerClip: "Idle_Loop",
          playerLibrary: getActionLibrary(action),
          playerFrom: start,
          playerTo: start,
          playerYaw: moving ? -0.9 : -0.35,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.65,
        },
        {
          label: action.label,
          durationMs: moving ? 1800 : 1700,
          playerClip: action.quaterniusClip,
          playerLibrary: getActionLibrary(action),
          playerFrom: start,
          playerTo: end,
          playerYaw: moving ? -0.9 : -0.35,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.65,
        },
        {
          label: "停住观察",
          durationMs: 900,
          playerClip: moving ? "Idle_Loop" : action.quaterniusClip,
          playerLibrary: getActionLibrary(action),
          playerFrom: end,
          playerTo: end,
          playerYaw: moving ? -0.9 : -0.35,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.65,
        },
      ],
    };
  }

  const start: AvatarLabAuditionVector = moving ? [0.92, 0, 0.76] : [0.72, 0, 0.72];
  const end: AvatarLabAuditionVector = moving ? [0.24, 0, 0.58] : start;
  return {
    id: `focused-agent:${action.id}:${revision}`,
    label: `智能体动作：${action.label}`,
    actor: "agent",
    purpose: action.purpose,
    decision: "lab_only",
    decisionNote: "实验室内单动作预览，不接主场景。",
    playerLibrary: "ual1",
    loop: false,
    steps: [
      {
        label: "准备",
        durationMs: 220,
        playerClip: "Idle_Loop",
        playerLibrary: "ual1",
        playerFrom: [-0.88, 0, 0.74],
        playerTo: [-0.88, 0, 0.74],
        playerYaw: -0.35,
        agentClip: "idle",
        agentFrom: start,
        agentTo: start,
        agentYaw: moving ? 1.25 : 2.65,
      },
      {
        label: action.label,
        durationMs: moving ? 1800 : 1750,
        playerClip: "Idle_Loop",
        playerLibrary: "ual1",
        playerFrom: [-0.88, 0, 0.74],
        playerTo: [-0.88, 0, 0.74],
        playerYaw: -0.35,
        agentClip: action.rocketboxClip,
        agentFrom: start,
        agentTo: end,
        agentYaw: moving ? 1.25 : 2.65,
      },
      {
        label: "停住观察",
        durationMs: 900,
        playerClip: "Idle_Loop",
        playerLibrary: "ual1",
        playerFrom: [-0.88, 0, 0.74],
        playerTo: [-0.88, 0, 0.74],
        playerYaw: -0.35,
        agentClip: moving ? "idle" : action.rocketboxClip,
        agentFrom: end,
        agentTo: end,
        agentYaw: moving ? 1.25 : 2.65,
      },
    ],
  };
}

export const AVATAR_LAB_AUDITION_COLLIDERS: readonly AvatarLabAuditionCollider[] =
  [
    {
      id: "desk",
      label: "办公桌",
      center: [0.18, -0.34],
      size: [1.25, 0.58],
    },
    {
      id: "chair",
      label: "椅子",
      center: [0.35, 0.35],
      size: [0.46, 0.48],
    },
    {
      id: "shelf",
      label: "书架",
      center: [-1.12, -0.9],
      size: [0.48, 0.24],
    },
    {
      id: "door",
      label: "门",
      center: [1.18, -0.8],
      size: [0.64, 0.18],
    },
  ] as const;

export function getManualAuditionAvailability(
  action: AvatarLabAction,
  actor: AvatarLabAuditionActor,
): AvatarLabManualAuditionAvailability {
  if (getActionStatus(action) !== "installed") {
    return {
      canAudition: false,
      reason: "候选动作尚未安装，只能记录和筛选，不能强行播放。",
    };
  }
  if (actor === "player") {
    return action.quaterniusClip
      ? { canAudition: true, reason: "可加入玩家试演。" }
      : {
          canAudition: false,
          reason: "玩家试演当前只接 Quaternius 已安装动作。",
        };
  }
  return action.rocketboxClip
    ? { canAudition: true, reason: "可加入智能体试演。" }
    : {
        canAudition: false,
        reason: "智能体试演当前只接 Rocketbox 已安装动作。",
      };
}

export function createManualAuditionChain(
  action: AvatarLabAction,
  actor: AvatarLabAuditionActor,
): AvatarLabAuditionChain | null {
  if (!getManualAuditionAvailability(action, actor).canAudition) return null;
  if (actor === "player" && action.quaterniusClip) {
    const library = action.library ?? "ual1";
    return {
      id: `manual-player:${action.id}`,
      label: `手动玩家：${action.label}`,
      actor: "player",
      purpose: `人工筛选动作：${action.purpose}`,
      decision:
        action.recommendation === "avoid" || getOfficeFit(action).tone === "bad"
          ? "lab_only"
          : "candidate",
      decisionNote: "从动作筛选手动加入，只在角色试演场验证。",
      playerLibrary: library,
      steps: [
        {
          label: "站位检查",
          durationMs: 500,
          playerClip: "Idle_Loop",
          playerFrom: [-0.82, 0, 0.72],
          playerTo: [-0.82, 0, 0.72],
          playerYaw: -0.38,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.7,
        },
        {
          label: `播放 ${action.clipName ?? action.label}`,
          durationMs: action.state === "walking" ? 1900 : 1600,
          playerClip: action.quaterniusClip,
          playerFrom:
            action.state === "walking" ? [-0.95, 0, 0.86] : [-0.82, 0, 0.72],
          playerTo:
            action.state === "walking" ? [-0.18, 0, 0.68] : [-0.82, 0, 0.72],
          playerYaw: action.state === "walking" ? -0.95 : -0.38,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.7,
        },
        {
          label: "回到待机",
          durationMs: 650,
          playerClip: "Idle_Loop",
          playerFrom:
            action.state === "walking" ? [-0.18, 0, 0.68] : [-0.82, 0, 0.72],
          playerTo:
            action.state === "walking" ? [-0.18, 0, 0.68] : [-0.82, 0, 0.72],
          playerYaw: action.state === "walking" ? -0.95 : -0.38,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.7,
        },
      ],
    };
  }
  if (actor === "agent" && action.rocketboxClip) {
    return {
      id: `manual-agent:${action.id}`,
      label: `手动智能体：${action.label}`,
      actor: "agent",
      purpose: `人工筛选动作：${action.purpose}`,
      decision:
        action.recommendation === "avoid" || getOfficeFit(action).tone === "bad"
          ? "lab_only"
          : "candidate",
      decisionNote: "从动作筛选手动加入，只在角色试演场验证。",
      steps: [
        {
          label: "站位检查",
          durationMs: 500,
          playerClip: "Idle_Loop",
          playerFrom: [-0.82, 0, 0.72],
          playerTo: [-0.82, 0, 0.72],
          playerYaw: -0.38,
          agentClip: "idle",
          agentFrom: [0.72, 0, 0.72],
          agentTo: [0.72, 0, 0.72],
          agentYaw: 2.7,
        },
        {
          label: `播放 ${action.clipName ?? action.label}`,
          durationMs: action.state === "walking" ? 1900 : 1700,
          playerClip: "Idle_Loop",
          playerFrom: [-0.82, 0, 0.72],
          playerTo: [-0.82, 0, 0.72],
          playerYaw: -0.38,
          agentClip: action.rocketboxClip,
          agentFrom:
            action.state === "walking" ? [0.92, 0, 0.76] : [0.72, 0, 0.72],
          agentTo:
            action.state === "walking" ? [0.18, 0, 0.68] : [0.72, 0, 0.72],
          agentYaw: action.state === "walking" ? 1.2 : 2.7,
        },
        {
          label: "回到待机",
          durationMs: 650,
          playerClip: "Idle_Loop",
          playerFrom: [-0.82, 0, 0.72],
          playerTo: [-0.82, 0, 0.72],
          playerYaw: -0.38,
          agentClip: "idle",
          agentFrom:
            action.state === "walking" ? [0.18, 0, 0.68] : [0.72, 0, 0.72],
          agentTo:
            action.state === "walking" ? [0.18, 0, 0.68] : [0.72, 0, 0.72],
          agentYaw: action.state === "walking" ? 1.2 : 2.7,
        },
      ],
    };
  }
  return null;
}

export function resolveAuditionCollision(
  position: AvatarLabAuditionVector,
  radius = 0.18,
): AvatarLabCollisionResult {
  let [x, y, z] = position;
  const hitLabels: string[] = [];
  for (const collider of AVATAR_LAB_AUDITION_COLLIDERS) {
    const halfX = collider.size[0] / 2 + radius;
    const halfZ = collider.size[1] / 2 + radius;
    const minX = collider.center[0] - halfX;
    const maxX = collider.center[0] + halfX;
    const minZ = collider.center[1] - halfZ;
    const maxZ = collider.center[1] + halfZ;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    hitLabels.push(collider.label);
    const pushLeft = Math.abs(x - minX);
    const pushRight = Math.abs(maxX - x);
    const pushBack = Math.abs(z - minZ);
    const pushFront = Math.abs(maxZ - z);
    const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);
    if (smallest === pushLeft) x = minX;
    else if (smallest === pushRight) x = maxX;
    else if (smallest === pushBack) z = minZ;
    else z = maxZ;
  }
  return { position: [x, y, z], hitLabels };
}

export function resolveAuditionActorCollision(
  playerPosition: AvatarLabAuditionVector,
  agentPosition: AvatarLabAuditionVector,
  radius = 0.2,
): {
  playerPosition: AvatarLabAuditionVector;
  agentPosition: AvatarLabAuditionVector;
  collided: boolean;
} {
  const dx = agentPosition[0] - playerPosition[0];
  const dz = agentPosition[2] - playerPosition[2];
  const distance = Math.hypot(dx, dz);
  const minDistance = radius * 2;
  if (distance >= minDistance) {
    return { playerPosition, agentPosition, collided: false };
  }
  const nx = distance > 0.0001 ? dx / distance : 1;
  const nz = distance > 0.0001 ? dz / distance : 0;
  const push = (minDistance - distance) / 2;
  return {
    playerPosition: [
      playerPosition[0] - nx * push,
      playerPosition[1],
      playerPosition[2] - nz * push,
    ],
    agentPosition: [
      agentPosition[0] + nx * push,
      agentPosition[1],
      agentPosition[2] + nz * push,
    ],
    collided: true,
  };
}

export const AVATAR_LAB_RECOMMENDED_ACTION_TABLE: readonly AvatarLabRecommendedActionRow[] =
  [
    {
      role: "player",
      roleLabel: "玩家",
      actionId: "q1:Walk_Loop",
      label: "走路",
      source: "quaternius",
      status: "installed",
      recommendation: "core",
      purpose: "第三视角基础移动，适合先验收朝向、比例和脚底滑动。",
      validation: "Quaternius UAL1 可预览。",
      caveat: "第一视角身体/手臂仍需单独验收，不接主场景。",
    },
    {
      role: "player",
      roleLabel: "玩家",
      actionId: "q1:Sprint_Loop",
      label: "跑步",
      source: "quaternius",
      status: "installed",
      recommendation: "core",
      purpose: "第三视角快速移动，已确认腿部骨骼会动。",
      validation: "Quaternius UAL1 可预览；Sprint_Loop 腿部 quaternion 轨道已检查。",
      caveat: "只作为角色管线候选，不接主场景控制器。",
    },
    {
      role: "player",
      roleLabel: "玩家",
      actionId: "q1:Interact",
      label: "交互/按按钮",
      source: "quaternius",
      status: "installed",
      recommendation: "core",
      purpose: "门禁、设备、工具柜的通用交互反馈候选。",
      validation: "Quaternius UAL1 可预览。",
      caveat: "不能直接接门或碰撞逻辑。",
    },
    {
      role: "player",
      roleLabel: "玩家",
      actionId: "q1:PickUp_Table",
      label: "桌面拿取",
      source: "quaternius",
      status: "installed",
      recommendation: "core",
      purpose: "拿资料册、任务卡、平板等桌面高度物体。",
      validation: "Quaternius UAL1 可预览。",
      caveat: "不适合地面拾取，需要另找低位拾取动作。",
    },
    {
      role: "agent",
      roleLabel: "智能体",
      actionId: "rbx:sit-chair",
      label: "椅子坐姿",
      source: "rocketbox",
      status: "installed",
      recommendation: "core",
      purpose: "工位、会议室和休息区的坐姿底层。",
      validation: "Rocketbox 可预览。",
      caveat: "不能代表键盘鼠标办公；需要上半身/手部动作叠加。",
    },
    {
      role: "agent",
      roleLabel: "智能体",
      actionId: "rbx:gestic-talk",
      label: "手势交谈",
      source: "rocketbox",
      status: "installed",
      recommendation: "core",
      purpose: "面对玩家解释任务、同事间短对话、接待交流。",
      validation: "Rocketbox 可预览。",
      caveat: "接主场景前需验收朝向、视线和对话距离。",
    },
    {
      role: "agent",
      roleLabel: "智能体",
      actionId: "mixamo:typing",
      label: "坐姿打字",
      source: "mixamo",
      status: "manual",
      recommendation: "core",
      purpose: "真正键盘办公的优先人工精选目标。",
      validation: "候选池记录，未安装。",
      caveat: "需要人工下载、许可留档、重定向和桌椅校准。",
    },
    {
      role: "npc",
      roleLabel: "NPC",
      actionId: "rbx:idle-neutral",
      label: "自然站立",
      source: "rocketbox",
      status: "installed",
      recommendation: "core",
      purpose: "办公室访客、街上行人和服务员的真人比例待机。",
      validation: "Rocketbox 可预览。",
      caveat: "需要批量变体，避免所有 NPC 同动作。",
    },
    {
      role: "npc",
      roleLabel: "NPC",
      actionId: "q2:Idle_FoldArms_Loop",
      label: "抱臂等待",
      source: "quaternius",
      status: "installed",
      recommendation: "core",
      purpose: "排队、等待、观察状态的低成本氛围动作。",
      validation: "Quaternius UAL2 可预览。",
      caveat: "风格偏低多边形，需要和最终角色路线统一。",
    },
    {
      role: "npc",
      roleLabel: "NPC",
      actionId: "rbx:knock-door",
      label: "敲门",
      source: "rocketbox",
      status: "installed",
      recommendation: "useful",
      purpose: "访客和会议室门口等待的氛围动作。",
      validation: "Rocketbox 可预览。",
      caveat: "只验角色动作，不改门状态机。",
    },
  ] as const;

export const AVATAR_LAB_AVOID_ACTION_TABLE: readonly AvatarLabAvoidActionRow[] = [
  {
    actionId: "q1:Jog_Fwd_Loop-as-run",
    label: "把慢跑当跑步",
    source: "quaternius",
    reason: "Jog_Fwd_Loop 可保留为慢跑候选，但正式 run 已选 Sprint_Loop；不要混用语义。",
  },
  {
    actionId: "q1:A_TPose/q2:A_TPose",
    label: "T Pose",
    source: "quaternius",
    reason: "只用于骨骼绑定检查，不进入玩家、智能体或 NPC 常规动作池。",
  },
  {
    actionId: "q1:Pistol_*",
    label: "枪械动作",
    source: "quaternius",
    reason: "和当前办公城市主题不匹配，且会增加玩法语义风险。",
  },
  {
    actionId: "q1:Sword_*/q2:Sword_*",
    label: "剑/近战动作",
    source: "quaternius",
    reason: "偏动作游戏，不建议用于第一阶段角色体系。",
  },
  {
    actionId: "q2:Zombie_*",
    label: "僵尸动作",
    source: "quaternius",
    reason: "风格与牧马城市办公、街区 NPC 不一致。",
  },
  {
    actionId: "q1:Death01/q1:Hit_*",
    label: "倒地/受击动作",
    source: "quaternius",
    reason: "当前目标是稳定工作与城市氛围，暂不做事故或战斗反馈。",
  },
  {
    actionId: "unavailable:*",
    label: "不可用外部资产",
    source: "unavailable",
    reason: "包含非商业、跨引擎或付费授权限制，本轮不下载、不打包、不接主场景。",
  },
] as const;

export const QUATERNIUS_RAW_CLIP_NAMES = [
  "A_TPose",
  "Crouch_Fwd_Loop",
  "Crouch_Idle_Loop",
  "Dance_Loop",
  "Death01",
  "Driving_Loop",
  "Fixing_Kneeling",
  "Hit_Chest",
  "Hit_Head",
  "Idle_Loop",
  "Idle_Talking_Loop",
  "Idle_Torch_Loop",
  "Interact",
  "Jog_Fwd_Loop",
  "Jump_Land",
  "Jump_Loop",
  "Jump_Start",
  "PickUp_Table",
  "Pistol_Aim_Down",
  "Pistol_Aim_Neutral",
  "Pistol_Aim_Up",
  "Pistol_Idle_Loop",
  "Pistol_Reload",
  "Pistol_Shoot",
  "Punch_Cross",
  "Punch_Enter",
  "Punch_Jab",
  "Push_Loop",
  "Roll",
  "Roll_RM",
  "Sitting_Enter",
  "Sitting_Exit",
  "Sitting_Idle_Loop",
  "Sitting_Talking_Loop",
  "Spell_Simple_Enter",
  "Spell_Simple_Exit",
  "Spell_Simple_Idle_Loop",
  "Spell_Simple_Shoot",
  "Sprint_Loop",
  "Swim_Fwd_Loop",
  "Swim_Idle_Loop",
  "Sword_Attack",
  "Sword_Attack_RM",
  "Sword_Idle",
  "Walk_Formal_Loop",
  "Walk_Loop",
] as const;

export const QUATERNIUS_UAL2_RAW_CLIP_NAMES = [
  "A_TPose",
  "Chest_Open",
  "ClimbUp_1m",
  "Consume",
  "Farm_Harvest",
  "Farm_PlantSeed",
  "Farm_Watering",
  "Hit_Knockback",
  "Idle_FoldArms_Loop",
  "Idle_Lantern_Loop",
  "Idle_No_Loop",
  "Idle_Rail_Call",
  "Idle_Rail_Loop",
  "Idle_Shield_Break",
  "Idle_Shield_Loop",
  "Idle_TalkingPhone_Loop",
  "LayToIdle",
  "Melee_Hook",
  "Melee_Hook_Rec",
  "NinjaJump_Idle_Loop",
  "NinjaJump_Land",
  "NinjaJump_Start",
  "OverhandThrow",
  "Shield_Dash",
  "Shield_OneShot",
  "Slide_Exit",
  "Slide_Loop",
  "Slide_Start",
  "Sword_Block",
  "Sword_Dash",
  "Sword_Heavy_Combo",
  "Sword_Regular_A",
  "Sword_Regular_A_Rec",
  "Sword_Regular_B",
  "Sword_Regular_B_Rec",
  "Sword_Regular_C",
  "Sword_Regular_Combo",
  "TreeChopping_Loop",
  "Walk_Carry_Loop",
  "Yes",
  "Zombie_Idle_Loop",
  "Zombie_Scratch",
  "Zombie_Walk_Fwd_Loop",
] as const;

const CORE_QUATERNIUS_CLIP_NAMES = new Set<string>([
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sitting_Idle_Loop",
  "Sitting_Talking_Loop",
  "Idle_Talking_Loop",
  "Interact",
  "PickUp_Table",
  "Push_Loop",
  "Jump_Start",
  "Jump_Loop",
  "Jump_Land",
  "Idle_FoldArms_Loop",
  "Idle_TalkingPhone_Loop",
  "Walk_Carry_Loop",
  "Consume",
  "Chest_Open",
  "Yes",
]);

export const QUATERNIUS_CORE_ACTION_IDS = [
  "q1:Idle_Loop",
  "q1:Walk_Loop",
  "q1:Jog_Fwd_Loop",
  "q1:Sitting_Idle_Loop",
  "q1:Sitting_Talking_Loop",
  "q1:Idle_Talking_Loop",
  "q1:Interact",
  "q1:PickUp_Table",
  "q1:Push_Loop",
  "q1:Jump_Start",
  "q2:Idle_FoldArms_Loop",
  "q2:Idle_TalkingPhone_Loop",
  "q2:Walk_Carry_Loop",
  "q2:Consume",
  "q2:Chest_Open",
] as const;

export const QUATERNIUS_KEYBOARD_MOUSE_CLIP_IDS = [] as const;

const OFFICE_COMPOSITION_CLIP_IDS = new Set<string>([
  "Sitting_Idle_Loop",
  "Sitting_Talking_Loop",
  "PickUp_Table",
  "Interact",
]);

function getOfficeFit(action: AvatarLabAction): OfficeFit {
  if (QUATERNIUS_KEYBOARD_MOUSE_CLIP_IDS.includes(action.id as never)) {
    return {
      label: "可直接办公",
      tone: "good",
      detail: "该动作可以直接用于键盘鼠标办公。",
    };
  }

  if (action.id === "desk") {
    return {
      label: "需组合",
      tone: "partial",
      detail:
        "这是工位办公占位：坐姿可用，但缺少键盘鼠标手部动作，需要后续做上半身叠加或补专门资产。",
    };
  }

  const clipName = action.clipName ?? "";
  if (OFFICE_COMPOSITION_CLIP_IDS.has(clipName)) {
    return {
      label: "可作办公素材",
      tone: "partial",
      detail:
        "可作为办公动作的一部分，但不能单独代表完整工位办公。需要和坐姿、桌椅定位、手部层动画组合。",
    };
  }

  if (action.category === "agent" && action.label.includes("坐")) {
    return {
      label: "坐姿底层",
      tone: "partial",
      detail: "适合验证坐姿和椅子，但不会自动把手放到键盘鼠标上。",
    };
  }

  return {
    label: "不适合键鼠办公",
    tone: "bad",
    detail: "这个动作不适合直接用作工位键盘鼠标办公，可按它的用途标注筛选。",
  };
}

function resolveActionState(clipName: string): RenderAgent["state"] {
  const lower = clipName.toLowerCase();
  if (
    lower.includes("walk") ||
    lower.includes("jog") ||
    lower.includes("sprint") ||
    lower.includes("swim")
  ) {
    return "walking";
  }
  if (lower.includes("sitting")) return "sitting";
  if (lower.includes("talk") || lower.includes("phone") || lower === "yes") {
    return "talking_to_player";
  }
  if (lower.includes("push") || lower.includes("chest_open")) {
    return "opening_door";
  }
  if (
    lower.includes("interact") ||
    lower.includes("pickup") ||
    lower.includes("fix") ||
    lower.includes("farm") ||
    lower.includes("consume") ||
    lower.includes("treechopping") ||
    lower.includes("pistol") ||
    lower.includes("sword") ||
    lower.includes("shield") ||
    lower.includes("spell")
  ) {
    return "using_tools";
  }
  if (lower.includes("dance")) return "dancing";
  return "standing";
}

function resolveWalkSpeed(clipName: string): number | undefined {
  const lower = clipName.toLowerCase();
  if (lower.includes("sprint")) return 3.2;
  if (lower.includes("jog")) return 2.2;
  if (lower.includes("walk") || lower.includes("zombie_walk")) return 1.25;
  if (lower.includes("swim")) return 1;
  return undefined;
}

function classifyQuaterniusClip(
  clipName: string,
  library: QuaterniusLibraryId,
): Pick<
  AvatarLabAction,
  "label" | "purpose" | "category" | "recommendation" | "note"
> {
  const lower = clipName.toLowerCase();
  const core = CORE_QUATERNIUS_CLIP_NAMES.has(clipName);

  const useful = (
    label: string,
    purpose: string,
    category: AvatarLabActionCategory,
    recommendation: AvatarLabRecommendation = core ? "core" : "useful",
  ) => ({
    label,
    purpose,
    category,
    recommendation,
    note: `${library.toUpperCase()} 原始动作：${clipName}`,
  });

  if (clipName === "A_TPose") {
    return useful("T Pose", "只用于检查骨骼绑定，不建议进主玩法。", "unused", "avoid");
  }
  if (lower.includes("death") || lower.includes("hit") || lower.includes("knockback")) {
    return useful("受击/倒地", "工作向游戏暂时用不到，除非后续做安全事故或剧情。", "unused", "avoid");
  }
  if (
    lower.includes("pistol") ||
    lower.includes("sword") ||
    lower.includes("spell") ||
    lower.includes("shield") ||
    lower.includes("melee") ||
    lower.includes("ninja")
  ) {
    return useful("战斗动作", "和办公互动主题不匹配，不建议使用。", "unused", "avoid");
  }
  if (lower.includes("zombie")) {
    return useful("特殊 NPC 动作", "风格不适合当前城市办公场景，不建议使用。", "unused", "avoid");
  }
  if (lower.includes("swim")) {
    return useful("游泳动作", "湖泊后续如果做可进入水域才需要，现在不建议优先使用。", "unused", "later");
  }
  if (lower.includes("slide") || lower.includes("roll") || lower.includes("climb")) {
    return useful("运动动作", "偏动作游戏，后续可做跑酷或越障实验。", "player", "later");
  }
  if (lower.includes("dance")) {
    return useful("情绪/庆祝", "休息区彩蛋可用，不建议做核心办公动作。", "npc", "later");
  }
  if (lower.includes("driving")) {
    return useful("驾驶坐姿", "后续做玩家开车或车行试驾时可用。", "player", "later");
  }
  if (lower.includes("jump")) {
    return useful("跳跃", "玩家第三视角基础动作，可拆成起跳、滞空、落地。", "player");
  }
  if (lower.includes("walk_formal")) {
    return useful("正式走路", "智能体和办公 NPC 的正式步态候选。", "agent");
  }
  if (lower.includes("walk_carry")) {
    return useful("手持走路", "玩家或智能体拿资料册、工具、平板移动时可用。", "player");
  }
  if (lower.includes("walk") || lower.includes("jog") || lower.includes("sprint")) {
    return useful("移动", "玩家第三视角、智能体巡航、街上 NPC 通勤可用。", "player");
  }
  if (lower.includes("sitting_talking")) {
    return useful("坐着对话", "智能体在工位或休息区和玩家交流时可用。", "agent");
  }
  if (lower.includes("sitting")) {
    return useful("坐姿", "智能体工位、会议室、休息区的基础动作。", "agent");
  }
  if (lower.includes("talkingphone")) {
    return useful("打电话", "通讯中心、接电话 NPC、智能体处理中断事件可用。", "agent");
  }
  if (lower.includes("talk")) {
    return useful("站立对话", "玩家与智能体、NPC 问候、智能体间交流可用。", "npc");
  }
  if (lower.includes("foldarms")) {
    return useful("抱臂等待", "NPC 排队、智能体短暂停留、玩家观察状态可用。", "npc");
  }
  if (lower === "yes" || lower.includes("no")) {
    return useful("点头/否定", "对话反馈动作，适合智能体简短回应。", "agent");
  }
  if (lower.includes("idle")) {
    return useful("待机", "基础站立姿态，适合玩家、智能体和 NPC。", "player");
  }
  if (lower.includes("pickup")) {
    return useful("桌面拿取", "可用于拿资料册、任务卡、平板、桌面工具。", "player");
  }
  if (lower.includes("interact")) {
    return useful("通用交互", "可用于点击屏幕、按按钮、操作工具柜。", "player");
  }
  if (lower.includes("push") || lower.includes("chest_open")) {
    return useful("打开/推动", "可用于开门、打开柜子、推设备。", "player");
  }
  if (lower.includes("fixing") || lower.includes("treechopping")) {
    return useful("工具操作", "可用于工具室、维修、健身器材或设备检查。", "agent");
  }
  if (lower.includes("farm") || lower.includes("consume")) {
    return useful("生活化操作", "可借用为拿取、放置、喝水、餐厅 NPC 操作。", "npc", core ? "core" : "later");
  }
  if (lower.includes("lantern") || lower.includes("torch")) {
    return useful("手持道具待机", "可改造为拿平板、门禁卡、资料册的持物姿态。", "player", "useful");
  }

  return useful("待筛选动作", "暂时没有明确用途，先保留给你筛选。", "unused", "later");
}

function createQuaterniusRawAction(
  clipName: string,
  library: QuaterniusLibraryId,
): AvatarLabAction {
  const metadata = classifyQuaterniusClip(clipName, library);
  return {
    id: `${library === "ual1" ? "q1" : "q2"}:${clipName}`,
    state: resolveActionState(clipName),
    label: metadata.label,
    note: metadata.note,
    purpose: metadata.purpose,
    category: metadata.category,
    recommendation: metadata.recommendation,
    walkSpeed: resolveWalkSpeed(clipName),
    quaterniusClip: clipName,
    clipName,
    library,
    raw: true,
    source: "quaternius",
    assetStatus: "installed",
    licenseNote: QUATERNIUS_LICENSE_NOTE,
    packagingNote:
      "已作为实验室动作库索引；通过人工验收前不设置为主场景资产。",
    previewNote: `${library.toUpperCase()} 动作可在对应 Quaternius 模型下预览。`,
  };
}

const QUATERNIUS_UAL1_RAW_ACTIONS = QUATERNIUS_RAW_CLIP_NAMES.map((clipName) =>
  createQuaterniusRawAction(clipName, "ual1"),
);

const QUATERNIUS_UAL2_RAW_ACTIONS = QUATERNIUS_UAL2_RAW_CLIP_NAMES.map(
  (clipName) => createQuaterniusRawAction(clipName, "ual2"),
);

export const QUATERNIUS_FREE_ACTION_COUNT =
  QUATERNIUS_RAW_CLIP_NAMES.length + QUATERNIUS_UAL2_RAW_CLIP_NAMES.length;

function createPreviewAgent(): RenderAgent {
  return {
    id: "avatar-lab-preview",
    name: "Avatar Lab",
    status: "idle",
    color: "#8b5cf6",
    item: "preview",
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    path: [],
    facing: 0,
    frame: 0,
    walkSpeed: 1.2,
    phaseOffset: 0,
    state: "standing",
    avatarProfile: createAgentAvatarProfileFromSeed("avatar-lab-preview"),
  };
}

function resolveModelUrl(modelId: AvatarLabModelId): string {
  if (modelId === "rocketbox") return ROCKETBOX_AGENT_URL;
  if (modelId === "quaterniusUal1") return QUATERNIUS_ANIMATION_LIBRARY_URL;
  if (modelId === "quaterniusUal2") return QUATERNIUS_ANIMATION_LIBRARY_2_URL;
  if (modelId === "legacyEmployee") return LEGACY_RIGGED_EMPLOYEE_URL;
  return LEGACY_RIGGED_MAN_URL;
}

function resolveAnimationOverride(
  modelId: AvatarLabModelId,
  action: AvatarLabAction,
): RiggedAnimationClipOverride | null {
  if (modelId === "rocketbox") return action.rocketboxClip ?? null;
  if (modelId === "quaterniusUal1" || modelId === "quaterniusUal2") {
    return action.quaterniusClip ?? null;
  }
  return action.legacyClip ?? null;
}

function createGroupedActions(actions: AvatarLabAction[]): AvatarLabActionGroup[] {
  return CATEGORY_ORDER.map((category) => {
    const grouped = actions
      .filter((action) => action.category === category)
      .sort((a, b) => {
        const rank = { core: 0, useful: 1, later: 2, avoid: 3 } as const;
        return rank[a.recommendation] - rank[b.recommendation];
      });
    return {
      id: category,
      label: CATEGORY_LABEL[category],
      description:
        category === "player"
          ? "玩家第一/第三视角优先动作。"
          : category === "agent"
            ? "智能体工作、交流、进入房间时可用。"
            : category === "npc"
              ? "街上行人、餐厅服务员、普通城市 NPC 可用。"
              : "不适合当前办公游戏，先放在这里避免误用。",
      actions: grouped,
    };
  }).filter((group) => group.actions.length > 0);
}

function inferActionUsageTags(
  action: AvatarLabAction,
): Exclude<AvatarLabUsageTag, "all">[] {
  const tags = new Set<Exclude<AvatarLabUsageTag, "all">>();
  if (action.category !== "unused") tags.add(action.category);
  if (
    action.state === "working_at_desk" ||
    action.state === "using_memory" ||
    action.state === "using_tools" ||
    action.state === "using_comms" ||
    action.id === "desk"
  ) {
    tags.add("office");
  }
  if (action.state === "sitting" || action.id.includes("Sitting")) {
    tags.add("rest");
  }
  if (action.state === "walking" || action.id.includes("Walk")) {
    tags.add("street");
  }
  if (tags.size === 0) tags.add("player");
  return [...tags];
}

function getActionSource(
  action: AvatarLabAction,
): Exclude<AvatarLabActionSource, "all"> {
  return action.source ?? "quaternius";
}

function getActionStatus(action: AvatarLabAction): AvatarLabAssetStatus {
  return action.assetStatus ?? "installed";
}

function getActionUsageTags(
  action: AvatarLabAction,
): Exclude<AvatarLabUsageTag, "all">[] {
  return action.usageTags ?? inferActionUsageTags(action);
}

function actionMatchesFilters(
  action: AvatarLabAction,
  sourceFilter: AvatarLabActionSource,
  usageFilter: AvatarLabUsageTag,
): boolean {
  const sourceMatches =
    sourceFilter === "all" || getActionSource(action) === sourceFilter;
  const usageMatches =
    usageFilter === "all" || getActionUsageTags(action).includes(usageFilter);
  return sourceMatches && usageMatches;
}

function createExternalCandidateAction(
  candidate: ActionAssetCandidate,
): AvatarLabAction {
  return {
    id: candidate.id,
    state: candidate.state as RenderAgent["state"],
    label: candidate.label,
    note: `${SOURCE_LABEL[candidate.source]} 候选动作：${candidate.originalName}`,
    purpose: candidate.purpose,
    category: candidate.category,
    recommendation: candidate.recommendation,
    source: candidate.source,
    usageTags: candidate.usageTags,
    assetStatus: candidate.status,
    licenseNote: candidate.licenseNote,
    packagingNote: candidate.packagingNote,
    previewNote: candidate.previewNote,
  };
}

const EXTERNAL_CANDIDATE_ACTIONS = EXTERNAL_ACTION_ASSET_CANDIDATES.map(
  createExternalCandidateAction,
);

function getInstalledActionGroups(modelId: AvatarLabModelId): AvatarLabActionGroup[] {
  if (modelId === "rocketbox") {
    return [
      {
        id: "rocketbox-installed",
        label: "Rocketbox 已安装动作",
        description:
          "当前本地可预览的真人比例动作，只在角色实验室筛选，不接主场景。",
        actions: ROCKETBOX_INSTALLED_ACTIONS,
      },
    ];
  }
  if (modelId === "quaterniusUal1") {
    return [
      {
        id: "curated",
        label: "核心候选（先试这 10-15 个）",
        description:
          "这些是当前工作向玩法最值得先验证的动作，不代表最终接入。",
        actions: CORE_ACTION_OPTIONS,
      },
      ...createGroupedActions(QUATERNIUS_UAL1_RAW_ACTIONS),
    ];
  }
  if (modelId === "quaterniusUal2") {
    return createGroupedActions(QUATERNIUS_UAL2_RAW_ACTIONS);
  }
  return [
    {
      id: "curated",
      label: "通用预览动作",
      description: "用于和 Quaternius / Rocketbox / Legacy 模型做基本风格对比。",
      actions: CORE_ACTION_OPTIONS,
    },
  ];
}

function getActionGroups(
  modelId: AvatarLabModelId,
  sourceFilter: AvatarLabActionSource,
  usageFilter: AvatarLabUsageTag,
): AvatarLabActionGroup[] {
  const includeInstalled =
    sourceFilter === "all" ||
    sourceFilter === "quaternius" ||
    sourceFilter === "rocketbox";
  const installedGroups = includeInstalled
    ? getInstalledActionGroups(modelId)
        .map((group) => ({
          ...group,
          actions: group.actions.filter((action) =>
            actionMatchesFilters(action, sourceFilter, usageFilter),
          ),
        }))
        .filter((group) => group.actions.length > 0)
    : [];
  const externalActions = EXTERNAL_CANDIDATE_ACTIONS.filter((action) =>
    actionMatchesFilters(action, sourceFilter, usageFilter),
  );
  const externalGroups = createGroupedActions(externalActions).map((group) => ({
    ...group,
    id: `candidate-${group.id}`,
    label: `候选池 / ${group.label}`,
    description:
      "这些是动作资产池记录，当前只做筛选和评估；未安装的动作不会在预览区强行播放。",
  }));
  return [...installedGroups, ...externalGroups];
}

function LabCamera({ mode }: { mode: AvatarLabCameraMode }) {
  const { camera } = useThree();
  useEffect(() => {
    if (mode === "firstPerson") {
      camera.position.set(0.08, 0.78, 0.62);
      camera.lookAt(0, 0.68, -0.75);
    } else {
      camera.position.set(0.9, 0.95, 2.2);
      camera.lookAt(0, 0.45, 0);
    }
  }, [camera, mode]);
  return null;
}

function LabFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 3.2]} />
        <meshStandardMaterial color="#d5d1c8" roughness={0.86} />
      </mesh>
      <gridHelper
        args={[3.2, 16, "#9a948a", "#c2bdb5"]}
        position={[0, 0.003, 0]}
      />
      <mesh position={[0, 0.01, -0.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 0.05]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.65} />
      </mesh>
    </group>
  );
}

function AuditionCollisionGuides() {
  return (
    <group>
      {AVATAR_LAB_AUDITION_COLLIDERS.map((collider) => (
        <group
          key={collider.id}
          position={[collider.center[0], 0.018, collider.center[1]]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={collider.size} />
            <meshBasicMaterial
              color="#f97316"
              transparent
              opacity={0.16}
              depthWrite={false}
            />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
            <edgesGeometry
              args={[new THREE.PlaneGeometry(collider.size[0], collider.size[1])]}
            />
            <lineBasicMaterial color="#fb923c" transparent opacity={0.62} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function AuditionActorFootprint({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.16, 0.2, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.78} />
    </mesh>
  );
}

function AvatarPreview({
  modelId,
  action,
  cameraMode,
}: {
  modelId: AvatarLabModelId;
  action: AvatarLabAction;
  cameraMode: AvatarLabCameraMode;
}) {
  const modelUrl = resolveModelUrl(modelId);
  const agentsRef = useRef<RenderAgent[]>([createPreviewAgent()]);
  const lookupRef = useRef(new Map<string, RenderAgent>());
  const appearance = useMemo(
    () => createAgentAvatarProfileFromSeed(`avatar-lab-${modelId}`),
    [modelId],
  );
  const animationOverride = resolveAnimationOverride(modelId, action);

  useEffect(() => {
    const agent = agentsRef.current[0];
    agent.state = action.state;
    agent.walkSpeed = action.walkSpeed ?? (action.state === "walking" ? 1.4 : 0);
    lookupRef.current.set(agent.id, agent);
  }, [action]);

  useFrame((_, delta) => {
    const agent = agentsRef.current[0];
    agent.frame += delta * (action.state === "walking" ? 8 : 2);
    agent.facing = 0;
    agent.walkSpeed = action.walkSpeed ?? (action.state === "walking" ? 1.4 : 0);
    agent.state = action.state;
  });

  const isQuaternius =
    modelId === "quaterniusUal1" || modelId === "quaterniusUal2";

  return (
    <group>
      <LabCamera mode={cameraMode} />
      <LabFloor />
      <group position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
        <RiggedCharacter
          url={modelUrl}
          agentId="avatar-lab-preview"
          agentsRef={agentsRef}
          agentLookupRef={lookupRef}
          scaleMultiplier={modelId === "rocketbox" ? 1.35 : 1.25}
          tint={isQuaternius ? "#64748b" : "#8b5cf6"}
          appearance={appearance}
          animationOverride={animationOverride}
        />
      </group>
    </group>
  );
}

function getAuditionChainDuration(chain: AvatarLabAuditionChain): number {
  return chain.steps.reduce((total, step) => total + step.durationMs, 0);
}

export function getAuditionChainStepLabels(chainId: string): string[] {
  return (
    AVATAR_LAB_AUDITION_CHAINS.find((chain) => chain.id === chainId)?.steps.map(
      (step) => step.label,
    ) ?? []
  );
}

function resolveAuditionStep(
  chain: AvatarLabAuditionChain,
  elapsedMs: number,
): { step: AvatarLabAuditionStep; index: number; progress: number } {
  const duration = getAuditionChainDuration(chain);
  const localTime =
    duration > 0
      ? chain.loop === false
        ? Math.min(elapsedMs, Math.max(0, duration - 1))
        : elapsedMs % duration
      : 0;
  let cursor = 0;
  for (let index = 0; index < chain.steps.length; index += 1) {
    const step = chain.steps[index];
    const nextCursor = cursor + step.durationMs;
    if (localTime <= nextCursor || index === chain.steps.length - 1) {
      const progress =
        step.durationMs <= 0
          ? 1
          : THREE.MathUtils.clamp((localTime - cursor) / step.durationMs, 0, 1);
      return { step, index, progress };
    }
    cursor = nextCursor;
  }
  return { step: chain.steps[0], index: 0, progress: 0 };
}

function sampleAuditionPosition(
  from: AvatarLabAuditionVector | undefined,
  to: AvatarLabAuditionVector | undefined,
  fallback: AvatarLabAuditionVector,
  progress: number,
): AvatarLabAuditionVector {
  const start = from ?? to ?? fallback;
  const end = to ?? from ?? fallback;
  return [
    THREE.MathUtils.lerp(start[0], end[0], progress),
    THREE.MathUtils.lerp(start[1], end[1], progress),
    THREE.MathUtils.lerp(start[2], end[2], progress),
  ];
}

function createAuditionAgent(id: string, name: string): RenderAgent {
  return {
    id,
    name,
    status: "idle",
    color: "#7a6b9f",
    item: "audition",
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    path: [],
    facing: Math.PI,
    frame: 0,
    walkSpeed: 0,
    phaseOffset: 0,
    state: "standing",
  };
}

function AuditionStageSet() {
  return (
    <group>
      <LabFloor />

      <group position={[0.18, 0, -0.34]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.25, 0.09, 0.58]} />
          <meshStandardMaterial color="#d8b982" roughness={0.72} />
        </mesh>
        {[
          [-0.52, 0.17, -0.22],
          [0.52, 0.17, -0.22],
          [-0.52, 0.17, 0.22],
          [0.52, 0.17, 0.22],
        ].map((position) => (
          <mesh key={position.join(",")} position={position as [number, number, number]} castShadow>
            <boxGeometry args={[0.06, 0.34, 0.06]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.65} />
          </mesh>
        ))}
        <mesh position={[0.06, 0.47, -0.13]} castShadow>
          <boxGeometry args={[0.36, 0.24, 0.025]} />
          <meshStandardMaterial color="#111827" roughness={0.55} />
        </mesh>
        <mesh position={[0.06, 0.355, 0.03]} castShadow>
          <boxGeometry args={[0.34, 0.025, 0.16]} />
          <meshStandardMaterial color="#1f2937" roughness={0.58} />
        </mesh>
        <mesh position={[-0.36, 0.42, 0.05]} rotation={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[0.2, 0.035, 0.28]} />
          <meshStandardMaterial color="#c084fc" roughness={0.7} />
        </mesh>
      </group>

      <group position={[0.35, 0, 0.35]}>
        <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.08, 0.38]} />
          <meshStandardMaterial color="#475569" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.52, 0.18]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.48, 0.08]} />
          <meshStandardMaterial color="#64748b" roughness={0.72} />
        </mesh>
      </group>

      <group position={[-1.12, 0, -0.9]}>
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 1.1, 0.18]} />
          <meshStandardMaterial color="#855f3f" roughness={0.78} />
        </mesh>
        {[-0.26, 0, 0.26].map((y) => (
          <mesh key={y} position={[0, 0.55 + y, -0.105]} castShadow>
            <boxGeometry args={[0.38, 0.025, 0.06]} />
            <meshStandardMaterial color="#eab308" roughness={0.7} />
          </mesh>
        ))}
      </group>

      <group position={[1.42, 0, -0.8]}>
        <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.1, 1.16, 0.08]} />
          <meshStandardMaterial color="#374151" roughness={0.65} />
        </mesh>
        <mesh position={[-0.24, 0.58, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.48, 1.08, 0.045]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.72} />
        </mesh>
        <mesh position={[-0.42, 0.58, -0.04]} castShadow>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function AvatarAuditionStage({
  chain,
}: {
  chain: AvatarLabAuditionChain;
}) {
  const playerGroupRef = useRef<THREE.Group>(null);
  const agentGroupRef = useRef<THREE.Group>(null);
  const playerAgentsRef = useRef<RenderAgent[]>([
    createAuditionAgent("avatar-lab-audition-player", "玩家试演"),
  ]);
  const agentAgentsRef = useRef<RenderAgent[]>([
    createAuditionAgent("avatar-lab-audition-agent", "智能体试演"),
  ]);
  const playerLookupRef = useRef(
    new Map<string, RenderAgent>([
      ["avatar-lab-audition-player", playerAgentsRef.current[0]],
    ]),
  );
  const agentLookupRef = useRef(
    new Map<string, RenderAgent>([
      ["avatar-lab-audition-agent", agentAgentsRef.current[0]],
    ]),
  );
  const chainStartRef = useRef(performance.now());
  const activeStepRef = useRef(0);
  const [playerClip, setPlayerClip] =
    useState<RiggedAnimationClipOverride>("Idle_Loop");
  const [playerLibrary, setPlayerLibrary] =
    useState<QuaterniusLibraryId>("ual1");
  const [agentClip, setAgentClip] =
    useState<RiggedAnimationClipOverride>("idle");

  useEffect(() => {
    chainStartRef.current = performance.now();
    activeStepRef.current = 0;
    setPlayerClip(chain.steps[0]?.playerClip ?? "Idle_Loop");
    setPlayerLibrary(chain.steps[0]?.playerLibrary ?? chain.playerLibrary ?? "ual1");
    setAgentClip(chain.steps[0]?.agentClip ?? "idle");
  }, [chain]);

  useFrame(() => {
    const elapsedMs = performance.now() - chainStartRef.current;
    const { step, index, progress } = resolveAuditionStep(chain, elapsedMs);
    if (activeStepRef.current !== index) {
      activeStepRef.current = index;
      setPlayerClip(step.playerClip ?? "Idle_Loop");
      setPlayerLibrary(step.playerLibrary ?? chain.playerLibrary ?? "ual1");
      setAgentClip(step.agentClip ?? "idle");
    }

    const sampledPlayerPosition = sampleAuditionPosition(
      step.playerFrom,
      step.playerTo,
      [-1.05, 0, 0.65],
      progress,
    );
    const sampledAgentPosition = sampleAuditionPosition(
      step.agentFrom,
      step.agentTo,
      [0.35, 0, 0.25],
      progress,
    );
    const playerCollision = resolveAuditionCollision(sampledPlayerPosition);
    const agentCollision = resolveAuditionCollision(sampledAgentPosition);
    const actorCollision = resolveAuditionActorCollision(
      playerCollision.position,
      agentCollision.position,
    );
    const playerPosition = resolveAuditionCollision(
      actorCollision.playerPosition,
    ).position;
    const agentPosition = resolveAuditionCollision(
      actorCollision.agentPosition,
    ).position;
    const playerYaw = step.playerYaw ?? 0.65;
    const agentYaw = step.agentYaw ?? -1.95;

    const playerGroup = playerGroupRef.current;
    if (playerGroup) {
      playerGroup.position.set(...playerPosition);
      playerGroup.rotation.y = playerYaw + Math.PI;
    }
    const agentGroup = agentGroupRef.current;
    if (agentGroup) {
      agentGroup.position.set(...agentPosition);
      agentGroup.rotation.y = agentYaw + Math.PI;
    }

    const playerAgent = playerAgentsRef.current[0];
    playerAgent.state =
      step.playerClip === "Walk_Loop" ||
      step.playerClip === "Sprint_Loop" ||
      step.playerClip === "Walk_Carry_Loop"
        ? "walking"
        : "standing";
    playerAgent.walkSpeed = step.playerClip === "Sprint_Loop" ? 3.2 : 1.3;
    playerAgent.frame += 1;

    const agent = agentAgentsRef.current[0];
    agent.state =
      step.agentClip === "walk"
        ? "walking"
        : step.agentClip === "sit_chair"
          ? "sitting"
          : step.agentClip === "work_table"
            ? "using_tools"
            : step.agentClip === "gestic_talk"
              ? "talking_to_player"
              : step.agentClip === "try_door"
                ? "opening_door"
                : "standing";
    agent.walkSpeed = step.agentClip === "walk" ? 1.35 : 0;
    agent.frame += 1;
  });

  return (
    <group>
      <LabCamera mode="thirdPerson" />
      <AuditionStageSet />
      <AuditionCollisionGuides />
      <group ref={playerGroupRef}>
        <AuditionActorFootprint color="#38bdf8" />
        <RiggedCharacter
          key={playerLibrary}
          url={
            playerLibrary === "ual2"
              ? QUATERNIUS_ANIMATION_LIBRARY_2_URL
              : QUATERNIUS_ANIMATION_LIBRARY_URL
          }
          agentId="avatar-lab-audition-player"
          agentsRef={playerAgentsRef}
          agentLookupRef={playerLookupRef}
          scaleMultiplier={1.32}
          tint="#64748b"
          animationOverride={playerClip}
        />
      </group>
      <group ref={agentGroupRef}>
        <AuditionActorFootprint color="#c084fc" />
        <RiggedCharacter
          url={ROCKETBOX_AGENT_URL}
          agentId="avatar-lab-audition-agent"
          agentsRef={agentAgentsRef}
          agentLookupRef={agentLookupRef}
          scaleMultiplier={1.18}
          tint="#8b5cf6"
          animationOverride={agentClip}
        />
      </group>
      <mesh position={[-0.43, 0.42, 0.02]} castShadow>
        <boxGeometry args={[0.18, 0.035, 0.26]} />
        <meshStandardMaterial color="#a78bfa" roughness={0.68} />
      </mesh>
      <group position={[-1.3, 1.18, 1.18]}>
        <mesh>
          <boxGeometry args={[1.55, 0.22, 0.025]} />
          <meshStandardMaterial color="#111827" transparent opacity={0.78} />
        </mesh>
      </group>
    </group>
  );
}

class AvatarLabErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AvatarLab failed to render", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            background: "#111827",
            color: "#f8fafc",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 520,
              borderRadius: 12,
              border: "1px solid rgba(248,250,252,0.16)",
              background: "rgba(15,23,42,0.88)",
              padding: 18,
            }}
          >
            <strong>角色实验室加载失败</strong>
            <div style={{ marginTop: 8, color: "rgba(248,250,252,0.72)" }}>
              资源预览失败，但不会影响正式办公室场景。
            </div>
            <code
              style={{
                display: "block",
                marginTop: 12,
                color: "#fca5a5",
                whiteSpace: "pre-wrap",
              }}
            >
              {this.state.error}
            </code>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AvatarLab({ onClose }: { onClose: () => void }) {
  const [labMode, setLabMode] = useState<AvatarLabMode>("auditionStage");
  const [modelId, setModelId] = useState<AvatarLabModelId>("rocketbox");
  const [actionId, setActionId] = useState<string>("rbx:idle-neutral");
  const [auditionChainId, setAuditionChainId] =
    useState<string>("player-walk");
  const [cameraMode, setCameraMode] =
    useState<AvatarLabCameraMode>("thirdPerson");
  const [sourceFilter, setSourceFilter] =
    useState<AvatarLabActionSource>("all");
  const [usageFilter, setUsageFilter] = useState<AvatarLabUsageTag>("all");
  const [roleFilter, setRoleFilter] =
    useState<AvatarLabAuditionActor>("player");
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(
    () => new Set(["q1:Idle_Loop"]),
  );
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(0);
  const [playerQueueIds, setPlayerQueueIds] = useState<string[]>([]);
  const [agentQueueIds, setAgentQueueIds] = useState<string[]>([]);
  const [activePreview, setActivePreview] = useState<{
    actor: AvatarLabAuditionActor;
    actionId: string | null;
  }>({ actor: "player", actionId: "q1:Idle_Loop" });
  const [previewRevision, setPreviewRevision] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    actionIds: string[];
  } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const allActions = useMemo(() => getAllAvatarLabActions(), []);
  const allActionById = useMemo(
    () => new Map(allActions.map((action) => [action.id, action])),
    [allActions],
  );
  const visibleActions = useMemo(
    () =>
      allActions.filter(
        (action) =>
          actionMatchesFilters(action, sourceFilter, usageFilter) &&
          getManualAuditionAvailability(action, roleFilter).canAudition,
      ),
    [allActions, roleFilter, sourceFilter, usageFilter],
  );
  const actionGroups = useMemo(
    () => getActionGroups(modelId, sourceFilter, usageFilter),
    [modelId, sourceFilter, usageFilter],
  );
  const availableActions = useMemo(
    () => visibleActions,
    [visibleActions],
  );

  useEffect(() => {
    if (!availableActions.some((action) => action.id === actionId)) {
      const nextId = availableActions[0]?.id ?? "q1:Idle_Loop";
      setActionId(nextId);
      setSelectedActionIds(new Set(nextId ? [nextId] : []));
      setLastSelectedIndex(0);
      setActivePreview({ actor: roleFilter, actionId: nextId });
      setPreviewRevision((current) => current + 1);
    }
  }, [actionId, availableActions, roleFilter]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const selectedModel =
    MODEL_OPTIONS.find((entry) => entry.id === modelId) ?? MODEL_OPTIONS[0];
  const selectedAction =
    availableActions.find((entry) => entry.id === actionId) ??
    allActionById.get(actionId) ??
    availableActions[0] ??
    allActions[0] ??
    CORE_ACTION_OPTIONS[0];
  const selectedOfficeFit = getOfficeFit(selectedAction);
  const playerQueueActions = playerQueueIds
    .map((id) => allActionById.get(id))
    .filter((action): action is AvatarLabAction => Boolean(action));
  const agentQueueActions = agentQueueIds
    .map((id) => allActionById.get(id))
    .filter((action): action is AvatarLabAction => Boolean(action));
  const activePreviewAction = activePreview.actionId
    ? allActionById.get(activePreview.actionId) ?? null
    : null;
  const selectedAuditionChain = useMemo(
    () =>
      createFocusedAuditionChain(
        activePreview.actor,
        activePreviewAction,
        previewRevision,
      ),
    [activePreview.actor, activePreviewAction, previewRevision],
  );
  const playerManualAvailability = getManualAuditionAvailability(
    selectedAction,
    "player",
  );
  const agentManualAvailability = getManualAuditionAvailability(
    selectedAction,
    "agent",
  );
  const addManualAudition = (actor: AvatarLabAuditionActor) => {
    const chain = createManualAuditionChain(selectedAction, actor);
    if (!chain) return;
    setActivePreview({ actor, actionId: selectedAction.id });
    setPreviewRevision((current) => current + 1);
    setAuditionChainId(chain.id);
    setLabMode("auditionStage");
  };
  const selectAction = (
    action: AvatarLabAction,
    index: number,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    setActionId(action.id);
    setSyncMessage(null);
    if (getManualAuditionAvailability(action, roleFilter).canAudition) {
      setActivePreview({ actor: roleFilter, actionId: action.id });
      setPreviewRevision((current) => current + 1);
    }
    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      setSelectedActionIds(
        new Set(visibleActions.slice(start, end + 1).map((entry) => entry.id)),
      );
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedActionIds((current) => {
        const next = new Set(current);
        if (next.has(action.id)) next.delete(action.id);
        else next.add(action.id);
        return next.size > 0 ? next : new Set([action.id]);
      });
      setLastSelectedIndex(index);
      return;
    }
    setSelectedActionIds(new Set([action.id]));
    setLastSelectedIndex(index);
  };
  const openActionContextMenu = (
    action: AvatarLabAction,
    index: number,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const actionIds = selectedActionIds.has(action.id)
      ? [...selectedActionIds]
      : [action.id];
    setActionId(action.id);
    setSelectedActionIds(new Set(actionIds));
    setLastSelectedIndex(index);
    setContextMenu({ x: event.clientX, y: event.clientY, actionIds });
  };
  const addActionsToQueue = (
    actor: AvatarLabAuditionActor,
    actionIds = [...selectedActionIds],
  ) => {
    const validIds = actionIds.filter((id) => {
      const action = allActionById.get(id);
      return action
        ? getManualAuditionAvailability(action, actor).canAudition
        : false;
    });
    const update = (current: string[]) => [
      ...current,
      ...validIds.filter((id) => !current.includes(id)),
    ];
    if (actor === "player") setPlayerQueueIds(update);
    else setAgentQueueIds(update);
    if (validIds[0]) {
      setActivePreview({ actor, actionId: validIds[0] });
      setPreviewRevision((current) => current + 1);
    }
    setLabMode("auditionStage");
    setAuditionChainId("manual-queue");
    setContextMenu(null);
    setSyncMessage(
      validIds.length > 0
        ? `已加入${actor === "player" ? "玩家" : "智能体"}动作 ${validIds.length} 个。`
        : "所选动作暂不能加入该角色队列；未安装候选只保留在动作总表。",
    );
  };
  const previewQueuedAction = (
    actor: AvatarLabAuditionActor,
    actionId: string,
  ) => {
    setActivePreview({ actor, actionId });
    setActionId(actionId);
    setSelectedActionIds(new Set([actionId]));
    setRoleFilter(actor);
    setPreviewRevision((current) => current + 1);
    setSyncMessage(null);
  };
  const removeQueuedAction = (
    actor: AvatarLabAuditionActor,
    actionId: string,
  ) => {
    if (actor === "player") {
      setPlayerQueueIds((current) => current.filter((id) => id !== actionId));
    } else {
      setAgentQueueIds((current) => current.filter((id) => id !== actionId));
    }
    if (activePreview.actor === actor && activePreview.actionId === actionId) {
      const remaining = (actor === "player" ? playerQueueIds : agentQueueIds).filter(
        (id) => id !== actionId,
      );
      setActivePreview({ actor, actionId: remaining[0] ?? null });
      setPreviewRevision((current) => current + 1);
    }
  };
  const selectedCount = selectedActionIds.size;
  const visibleActionCount = availableActions.length;
  const externalCandidateCount = EXTERNAL_CANDIDATE_ACTIONS.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
        background: "rgba(10, 13, 18, 0.58)",
        backdropFilter: "blur(8px)",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="角色实验室"
        style={{
          width: "min(1480px, calc(100vw - 16px))",
          height: "min(920px, calc(100vh - 16px))",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          overflow: "hidden",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(17, 24, 39, 0.94)",
          color: "#f8fafc",
          boxShadow: "0 24px 70px rgba(0,0,0,0.4)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "16px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>角色实验室</div>
            <div
              style={{
                marginTop: 4,
                color: "rgba(248,250,252,0.68)",
                fontSize: 13,
              }}
            >
              免费 Quaternius Standard 已索引 {QUATERNIUS_FREE_ACTION_COUNT} 个动作：
              UAL1 {QUATERNIUS_RAW_CLIP_NAMES.length} 个，UAL2{" "}
              {QUATERNIUS_UAL2_RAW_CLIP_NAMES.length} 个。完整 120+ 属于付费
              Source/Pro 范围，本轮不使用。
            </div>
            {labMode === "assetPool" ? (
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  maxWidth: 880,
                  borderRadius: 8,
                  border: "1px solid rgba(251,191,36,0.34)",
                  background: "rgba(251,191,36,0.12)",
                  color: "#fde68a",
                  padding: "6px 9px",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                结论：免费 Quaternius 里暂未发现“坐在工位、双手精准放键盘鼠标”的现成动作。
                工位办公需要“坐姿底层 + 上半身/手部层动画”组合，或后续补专门办公动作资产。
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPlayerQueueIds([]);
                setAgentQueueIds([]);
                setSyncMessage("已清空待同步动作集。");
              }}
              style={{
                border: "1px solid rgba(96,165,250,0.62)",
                borderRadius: 10,
                background: "rgba(96,165,250,0.14)",
                color: "#f8fafc",
                padding: "9px 12px",
                cursor: "pointer",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              清空动作队列
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                color: "#f8fafc",
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              关闭
            </button>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px minmax(0, 1fr)",
            minHeight: 0,
          }}
        >
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: 18,
              borderRight: "1px solid rgba(255,255,255,0.1)",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(96,165,250,0.24)",
                background: "rgba(15,23,42,0.78)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                {roleFilter === "player" ? "玩家动作" : "智能体动作"}
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: "rgba(248,250,252,0.62)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                单击立即预览，Ctrl 多选，Shift 连选；右键动作加入当前角色队列。
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                {(["player", "agent"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setRoleFilter(role);
                      setSelectedActionIds(new Set());
                      setLastSelectedIndex(null);
                    }}
                    style={{
                      borderRadius: 9,
                      border:
                        roleFilter === role
                          ? "1px solid rgba(96,165,250,0.92)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        roleFilter === role
                          ? role === "player"
                            ? "rgba(56,189,248,0.16)"
                            : "rgba(168,85,247,0.16)"
                          : "rgba(255,255,255,0.045)",
                      color: "#f8fafc",
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {role === "player" ? "玩家动作" : "智能体动作"}
                  </button>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                {SOURCE_ORDER.map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSourceFilter(source)}
                    style={{
                      borderRadius: 9,
                      border:
                        sourceFilter === source
                          ? "1px solid rgba(96,165,250,0.92)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        sourceFilter === source
                          ? "rgba(96,165,250,0.16)"
                          : "rgba(255,255,255,0.045)",
                      color: "#f8fafc",
                      padding: "7px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {SOURCE_LABEL[source]}
                  </button>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginTop: 9,
                }}
              >
                {USAGE_ORDER.map((usage) => (
                  <button
                    key={usage}
                    type="button"
                    onClick={() => setUsageFilter(usage)}
                    style={{
                      borderRadius: 999,
                      border:
                        usageFilter === usage
                          ? "1px solid rgba(251,191,36,0.9)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        usageFilter === usage
                          ? "rgba(251,191,36,0.14)"
                          : "rgba(255,255,255,0.04)",
                      color: "#f8fafc",
                      padding: "5px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {USAGE_LABEL[usage]}
                  </button>
                ))}
              </div>
              <div
                style={{
                  marginTop: 9,
                  color: "rgba(248,250,252,0.55)",
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                当前显示 {visibleActionCount} 个；已选 {selectedCount} 个。
              </div>
              <button
                type="button"
                onClick={() => addActionsToQueue(roleFilter)}
                disabled={selectedActionIds.size === 0}
                style={{
                  marginTop: 9,
                  width: "100%",
                  borderRadius: 9,
                  border:
                    roleFilter === "player"
                      ? "1px solid rgba(56,189,248,0.58)"
                      : "1px solid rgba(192,132,252,0.58)",
                  background:
                    selectedActionIds.size === 0
                      ? "rgba(255,255,255,0.035)"
                      : roleFilter === "player"
                        ? "rgba(56,189,248,0.14)"
                        : "rgba(168,85,247,0.16)",
                  color:
                    selectedActionIds.size === 0
                      ? "rgba(248,250,252,0.42)"
                      : "#f8fafc",
                  padding: "8px 9px",
                  cursor: selectedActionIds.size === 0 ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                加入{roleFilter === "player" ? "玩家" : "智能体"}动作
              </button>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(2,6,23,0.34)",
                padding: 10,
              }}
            >
              <div style={{ display: "grid", gap: 7 }}>
                {visibleActions.map((entry, index) => {
                  const selected = selectedActionIds.has(entry.id);
                  const playerReady = getManualAuditionAvailability(
                    entry,
                    "player",
                  ).canAudition;
                  const agentReady = getManualAuditionAvailability(
                    entry,
                    "agent",
                  ).canAudition;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={(event) => selectAction(entry, index, event)}
                      onContextMenu={(event) =>
                        openActionContextMenu(entry, index, event)
                      }
                      style={{
                        width: "100%",
                        borderRadius: 9,
                        border: selected
                          ? "1px solid rgba(96,165,250,0.96)"
                          : "1px solid rgba(255,255,255,0.1)",
                        background: selected
                          ? "rgba(96,165,250,0.16)"
                          : entry.recommendation === "avoid"
                            ? "rgba(248,113,113,0.055)"
                            : "rgba(255,255,255,0.04)",
                        color: "#f8fafc",
                        padding: "8px 9px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <strong style={{ fontSize: 12 }}>{entry.label}</strong>
                        <span
                          style={{
                            color:
                              getActionStatus(entry) === "installed"
                                ? "#86efac"
                                : "#fde68a",
                            fontSize: 10,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {SOURCE_LABEL[getActionSource(entry)]}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          color: "rgba(248,250,252,0.58)",
                          fontSize: 11,
                          lineHeight: 1.35,
                        }}
                      >
                        {entry.purpose}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 5,
                          marginTop: 6,
                        }}
                      >
                        <span
                          style={{
                            borderRadius: 999,
                            background:
                              getActionStatus(entry) === "installed"
                                ? "rgba(34,197,94,0.14)"
                                : "rgba(251,191,36,0.14)",
                            color:
                              getActionStatus(entry) === "installed"
                                ? "#bbf7d0"
                                : "#fde68a",
                            padding: "2px 6px",
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          {ASSET_STATUS_LABEL[getActionStatus(entry)]}
                        </span>
                        {playerReady ? (
                          <span
                            style={{
                              borderRadius: 999,
                              background: "rgba(56,189,248,0.14)",
                              color: "#bae6fd",
                              padding: "2px 6px",
                              fontSize: 10,
                            }}
                          >
                            玩家可试
                          </span>
                        ) : null}
                        {agentReady ? (
                          <span
                            style={{
                              borderRadius: 999,
                              background: "rgba(192,132,252,0.14)",
                              color: "#e9d5ff",
                              padding: "2px 6px",
                              fontSize: 10,
                            }}
                          >
                            智能体可试
                          </span>
                        ) : null}
                        {entry.clipName ? (
                          <span
                            style={{
                              borderRadius: 999,
                              background: "rgba(147,197,253,0.1)",
                              color: "rgba(191,219,254,0.86)",
                              padding: "2px 6px",
                              fontSize: 10,
                            }}
                          >
                            {entry.library?.toUpperCase()} / {entry.clipName}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(34,197,94,0.22)",
                background: "rgba(20,83,45,0.12)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>待同步动作集</div>
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gap: 8,
                  fontSize: 11,
                  lineHeight: 1.35,
                }}
              >
                <div
                  style={{
                    borderRadius: 9,
                    background: "rgba(56,189,248,0.08)",
                    border: "1px solid rgba(56,189,248,0.16)",
                    padding: "7px 8px",
                    color: "#bae6fd",
                  }}
                >
                  玩家队列：{playerQueueActions.length} 个
                  {playerQueueActions.length > 0
                    ? ` / ${playerQueueActions.map((action) => action.label).join("、")}`
                    : ""}
                </div>
                <div
                  style={{
                    borderRadius: 9,
                    background: "rgba(168,85,247,0.08)",
                    border: "1px solid rgba(168,85,247,0.16)",
                    padding: "7px 8px",
                    color: "#e9d5ff",
                  }}
                >
                  智能体队列：{agentQueueActions.length} 个
                  {agentQueueActions.length > 0
                    ? ` / ${agentQueueActions.map((action) => action.label).join("、")}`
                    : ""}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPlayerQueueIds([]);
                    setAgentQueueIds([]);
                    setSyncMessage("已清空待同步动作集。");
                  }}
                  style={{
                    borderRadius: 9,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.045)",
                    color: "#f8fafc",
                    padding: "8px 9px",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  清空队列
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSyncMessage(
                      `已生成待同步动作集：玩家 ${playerQueueActions.length} 个，智能体 ${agentQueueActions.length} 个。下一步由主场景调试入口接入。`,
                    )
                  }
                  style={{
                    borderRadius: 9,
                    border: "1px solid rgba(34,197,94,0.58)",
                    background: "rgba(34,197,94,0.14)",
                    color: "#dcfce7",
                    padding: "8px 9px",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  同步到游戏中
                </button>
              </div>
              {syncMessage ? (
                <div
                  style={{
                    marginTop: 9,
                    color: "#fde68a",
                    fontSize: 11,
                    lineHeight: 1.4,
                  }}
                >
                  {syncMessage}
                </div>
              ) : null}
            </div>

            <div style={{ display: "none" }}>
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(15,23,42,0.76)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                实验室模式
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                {([
                  ["assetPool", "动作筛选"],
                  ["auditionStage", "角色试演场"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLabMode(mode)}
                    style={{
                      borderRadius: 9,
                      border:
                        labMode === mode
                          ? "1px solid rgba(96,165,250,0.92)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        labMode === mode
                          ? "rgba(96,165,250,0.16)"
                          : "rgba(255,255,255,0.045)",
                      color: "#f8fafc",
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(168,85,247,0.24)",
                background: "rgba(15,23,42,0.74)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                场景动作按钮
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: "rgba(248,250,252,0.62)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                每个按钮播放多段动作链，只在试演场验证，不接 Office3D 主场景。
              </div>
              <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                {AVATAR_LAB_AUDITION_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={() => {
                      setLabMode("auditionStage");
                      setAuditionChainId(chain.id);
                    }}
                    style={{
                      borderRadius: 9,
                      border:
                        auditionChainId === chain.id &&
                        labMode === "auditionStage"
                          ? "1px solid rgba(168,85,247,0.92)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        auditionChainId === chain.id &&
                        labMode === "auditionStage"
                          ? "rgba(168,85,247,0.16)"
                          : chain.decision === "candidate"
                            ? "rgba(34,197,94,0.055)"
                            : "rgba(251,191,36,0.07)",
                      color: "#f8fafc",
                      padding: "8px 9px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ fontSize: 12 }}>{chain.label}</strong>
                      <span
                        style={{
                          color:
                            chain.decision === "candidate"
                              ? "#86efac"
                              : "#fde68a",
                          fontSize: 10,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {chain.steps.length} 步
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(248,250,252,0.58)",
                        fontSize: 11,
                        lineHeight: 1.35,
                      }}
                    >
                      {chain.purpose}
                    </div>
                  </button>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gap: 7,
                  fontSize: 11,
                  lineHeight: 1.35,
                }}
              >
                <div
                  style={{
                    borderRadius: 9,
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.16)",
                    color: "#bbf7d0",
                    padding: "7px 9px",
                  }}
                >
                  可接主场景候选：
                  {AVATAR_LAB_AUDITION_CONNECTABLE_CHAINS.map(
                    (chain) => chain.label,
                  ).join("、")}
                </div>
                <div
                  style={{
                    borderRadius: 9,
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.18)",
                    color: "#fde68a",
                    padding: "7px 9px",
                  }}
                >
                  暂不建议接：
                  {AVATAR_LAB_AUDITION_NOT_RECOMMENDED_CHAINS.map(
                    (chain) => chain.label,
                  ).join("、")}
                </div>
              </div>
              {labMode === "auditionStage" ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 10,
                    border: "1px solid rgba(96,165,250,0.22)",
                    background: "rgba(2,6,23,0.38)",
                    padding: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <strong style={{ fontSize: 12 }}>调试面板</strong>
                    <span
                      style={{
                        borderRadius: 999,
                        background:
                          selectedAuditionChain.decision === "candidate"
                            ? "rgba(34,197,94,0.14)"
                            : "rgba(251,191,36,0.14)",
                        color:
                          selectedAuditionChain.decision === "candidate"
                            ? "#bbf7d0"
                            : "#fde68a",
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    >
                      {selectedAuditionChain.decision === "candidate"
                        ? "可候选"
                        : "实验室"}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      color: "rgba(248,250,252,0.62)",
                      fontSize: 11,
                      lineHeight: 1.45,
                    }}
                  >
                    链路 ID：{selectedAuditionChain.id}
                  </div>
                  <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                    {selectedAuditionChain.steps.map((step, index) => (
                      <div
                        key={`${selectedAuditionChain.id}:${index}`}
                        style={{
                          borderRadius: 8,
                          background: "rgba(255,255,255,0.045)",
                          padding: "6px 7px",
                          fontSize: 11,
                          lineHeight: 1.35,
                        }}
                      >
                        <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                          {index + 1}. {step.label}
                        </div>
                        <div style={{ color: "rgba(147,197,253,0.74)" }}>
                          玩家：{step.playerClip ?? "保持"} / 智能体：
                          {step.agentClip ?? "保持"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: "rgba(248,250,252,0.58)",
                      fontSize: 11,
                      lineHeight: 1.45,
                    }}
                  >
                    选择动画：点左侧动作链按钮。新增或修改链路：编辑
                    AVATAR_LAB_AUDITION_CHAINS，并同步角色实验室测试。
                  </div>
                </div>
              ) : null}
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(14,165,233,0.24)",
                background: "rgba(8,47,73,0.22)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                手动加入试演场
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: "rgba(248,250,252,0.64)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                先在动作筛选里点一个动作，再把已安装动作加入玩家或智能体试演。
              </div>
              <div
                style={{
                  marginTop: 9,
                  borderRadius: 9,
                  background: "rgba(255,255,255,0.045)",
                  padding: "8px 9px",
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                  当前选择：{selectedAction.label}
                </div>
                <div style={{ color: "rgba(147,197,253,0.76)", marginTop: 3 }}>
                  {getActionSource(selectedAction) === "quaternius"
                    ? selectedAction.clipName ?? selectedAction.quaterniusClip
                    : selectedAction.clipName ?? selectedAction.rocketboxClip ?? selectedAction.id}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 9,
                }}
              >
                <button
                  type="button"
                  disabled={!playerManualAvailability.canAudition}
                  onClick={() => addManualAudition("player")}
                  title={playerManualAvailability.reason}
                  style={{
                    borderRadius: 9,
                    border: playerManualAvailability.canAudition
                      ? "1px solid rgba(56,189,248,0.72)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: playerManualAvailability.canAudition
                      ? "rgba(56,189,248,0.15)"
                      : "rgba(255,255,255,0.035)",
                    color: playerManualAvailability.canAudition
                      ? "#e0f2fe"
                      : "rgba(248,250,252,0.42)",
                    padding: "8px 9px",
                    cursor: playerManualAvailability.canAudition
                      ? "pointer"
                      : "not-allowed",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  加入玩家
                </button>
                <button
                  type="button"
                  disabled={!agentManualAvailability.canAudition}
                  onClick={() => addManualAudition("agent")}
                  title={agentManualAvailability.reason}
                  style={{
                    borderRadius: 9,
                    border: agentManualAvailability.canAudition
                      ? "1px solid rgba(192,132,252,0.72)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: agentManualAvailability.canAudition
                      ? "rgba(168,85,247,0.16)"
                      : "rgba(255,255,255,0.035)",
                    color: agentManualAvailability.canAudition
                      ? "#f3e8ff"
                      : "rgba(248,250,252,0.42)",
                    padding: "8px 9px",
                    cursor: agentManualAvailability.canAudition
                      ? "pointer"
                      : "not-allowed",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  加入智能体
                </button>
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: "rgba(248,250,252,0.56)",
                  fontSize: 11,
                  lineHeight: 1.4,
                }}
              >
                {playerManualAvailability.canAudition
                  ? playerManualAvailability.reason
                  : agentManualAvailability.canAudition
                    ? agentManualAvailability.reason
                    : `${playerManualAvailability.reason} ${agentManualAvailability.reason}`}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(96,165,250,0.22)",
                background: "rgba(15,23,42,0.78)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                动作资产池
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: "rgba(248,250,252,0.66)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                已放入实验室筛选：Quaternius 可预览{" "}
                {QUATERNIUS_FREE_ACTION_COUNT} 个；CMU / Rokoko / Mixamo /
                不可用候选 {externalCandidateCount} 个。候选先筛选标注，不强行打包原始动作。
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                {SOURCE_ORDER.map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSourceFilter(source)}
                    style={{
                      borderRadius: 9,
                      border:
                        sourceFilter === source
                          ? "1px solid rgba(96,165,250,0.92)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        sourceFilter === source
                          ? "rgba(96,165,250,0.16)"
                          : "rgba(255,255,255,0.045)",
                      color: "#f8fafc",
                      padding: "7px 6px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {SOURCE_LABEL[source]}
                  </button>
                ))}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {USAGE_ORDER.map((usage) => (
                  <button
                    key={usage}
                    type="button"
                    onClick={() => setUsageFilter(usage)}
                    style={{
                      borderRadius: 999,
                      border:
                        usageFilter === usage
                          ? "1px solid rgba(251,191,36,0.92)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        usageFilter === usage
                          ? "rgba(251,191,36,0.16)"
                          : "rgba(255,255,255,0.045)",
                      color: "#f8fafc",
                      padding: "5px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {USAGE_LABEL[usage]}
                  </button>
                ))}
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: "rgba(147,197,253,0.78)",
                  fontSize: 11,
                }}
              >
                当前筛选结果：{visibleActionCount} 个动作条目
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(96,165,250,0.22)",
                background: "rgba(15,23,42,0.66)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                Quaternius 玩家验证
              </div>
              <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                {QUATERNIUS_PLAYER_ACTION_VERIFICATION_TABLE.map((row) => (
                  <div
                    key={row.actionId}
                    style={{
                      borderRadius: 9,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background:
                        row.labStatus === "verified"
                          ? "rgba(34,197,94,0.06)"
                          : "rgba(251,191,36,0.08)",
                      padding: "7px 9px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ fontSize: 12 }}>{row.label}</strong>
                      <span
                        style={{
                          color:
                            row.labStatus === "verified" ? "#86efac" : "#fde68a",
                          fontSize: 10,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.labStatus === "verified" ? "可候选" : "实验室"}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(248,250,252,0.62)",
                        fontSize: 11,
                        lineHeight: 1.35,
                      }}
                    >
                      {row.purpose}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: row.legMotionVerified ? "#bfdbfe" : "rgba(248,250,252,0.46)",
                        fontSize: 10,
                        lineHeight: 1.35,
                      }}
                    >
                      {row.clipName}：{row.evidence}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
                {AVATAR_LAB_ACTION_GAPS.map((gap) => (
                  <div
                    key={gap.id}
                    style={{
                      borderRadius: 9,
                      border: "1px solid rgba(251,191,36,0.18)",
                      background: "rgba(251,191,36,0.07)",
                      color: "#fde68a",
                      padding: "7px 9px",
                      fontSize: 11,
                      lineHeight: 1.35,
                    }}
                  >
                    <strong>{gap.label}</strong>：{gap.missing}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(34,197,94,0.2)",
                background: "rgba(15,23,42,0.66)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                推荐动作表
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
                {AVATAR_LAB_RECOMMENDED_ACTION_TABLE.map((row) => (
                  <div
                    key={`${row.role}:${row.actionId}`}
                    style={{
                      borderRadius: 9,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.035)",
                      padding: "8px 9px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ fontSize: 12 }}>{row.roleLabel}</strong>
                      <span
                        style={{
                          color:
                            row.status === "installed" ? "#86efac" : "#fde68a",
                          fontSize: 10,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {SOURCE_LABEL[row.source]} / {ASSET_STATUS_LABEL[row.status]}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "#f8fafc",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {row.label}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(248,250,252,0.62)",
                        fontSize: 11,
                        lineHeight: 1.35,
                      }}
                    >
                      {row.purpose}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(248,113,113,0.2)",
                background: "rgba(69,10,10,0.24)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900 }}>
                不建议使用
              </div>
              <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                {AVATAR_LAB_AVOID_ACTION_TABLE.map((row) => (
                  <div
                    key={row.actionId}
                    style={{
                      borderRadius: 9,
                      border: "1px solid rgba(248,113,113,0.12)",
                      background: "rgba(248,113,113,0.055)",
                      padding: "7px 9px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <strong style={{ fontSize: 12 }}>{row.label}</strong>
                      <span
                        style={{
                          color: "#fecaca",
                          fontSize: 10,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {SOURCE_LABEL[row.source]}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(254,226,226,0.82)",
                        fontSize: 11,
                        lineHeight: 1.35,
                      }}
                    >
                      {row.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(248,250,252,0.55)",
                  fontWeight: 700,
                }}
              >
                人物来源
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {MODEL_OPTIONS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setModelId(entry.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: 10,
                      border:
                        modelId === entry.id
                          ? "1px solid rgba(251,191,36,0.9)"
                          : "1px solid rgba(255,255,255,0.12)",
                      background:
                        modelId === entry.id
                          ? "rgba(251,191,36,0.12)"
                          : "rgba(255,255,255,0.045)",
                      color: "#f8fafc",
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <strong>{entry.label}</strong>
                      <span
                        style={{
                          fontSize: 11,
                          color:
                            entry.status === "ready" ? "#86efac" : "#fde68a",
                        }}
                      >
                        {entry.status === "ready" ? "可预览" : "实验"}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        lineHeight: 1.45,
                        color: "rgba(248,250,252,0.64)",
                      }}
                    >
                      {entry.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(248,250,252,0.55)",
                  fontWeight: 700,
                }}
              >
                动作来源
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                {SOURCE_ORDER.map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSourceFilter(source)}
                    style={{
                      borderRadius: 9,
                      border:
                        sourceFilter === source
                          ? "1px solid rgba(96,165,250,0.9)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        sourceFilter === source
                          ? "rgba(96,165,250,0.13)"
                          : "rgba(255,255,255,0.04)",
                      color: "#f8fafc",
                      padding: "7px 8px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {SOURCE_LABEL[source]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(248,250,252,0.55)",
                  fontWeight: 700,
                }}
              >
                用途筛选
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                {USAGE_ORDER.map((usage) => (
                  <button
                    key={usage}
                    type="button"
                    onClick={() => setUsageFilter(usage)}
                    style={{
                      borderRadius: 999,
                      border:
                        usageFilter === usage
                          ? "1px solid rgba(251,191,36,0.9)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        usageFilter === usage
                          ? "rgba(251,191,36,0.14)"
                          : "rgba(255,255,255,0.04)",
                      color: "#f8fafc",
                      padding: "6px 9px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {USAGE_LABEL[usage]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(248,250,252,0.55)",
                  fontWeight: 700,
                }}
              >
                动作分类
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {actionGroups.map((group) => (
                  <section key={group.id}>
                    <div
                      style={{
                        margin: "8px 0 4px",
                        color: "rgba(248,250,252,0.72)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {group.label}（{group.actions.length}）
                    </div>
                    <div
                      style={{
                        marginBottom: 7,
                        color: "rgba(248,250,252,0.48)",
                        fontSize: 11,
                        lineHeight: 1.35,
                      }}
                    >
                      {group.description}
                    </div>
                    <div style={{ display: "grid", gap: 7 }}>
                      {group.actions.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setActionId(entry.id)}
                          style={{
                            width: "100%",
                            borderRadius: 9,
                            border:
                              actionId === entry.id
                                ? "1px solid rgba(96,165,250,0.9)"
                                : "1px solid rgba(255,255,255,0.1)",
                            background:
                              actionId === entry.id
                                ? "rgba(96,165,250,0.13)"
                                : entry.recommendation === "avoid"
                                  ? "rgba(248,113,113,0.06)"
                                  : entry.raw
                                    ? "rgba(255,255,255,0.025)"
                                    : "rgba(255,255,255,0.04)",
                            color: "#f8fafc",
                            padding: "8px 10px",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>{entry.label}</span>
                            <span
                              style={{
                                color:
                                  entry.recommendation === "core"
                                    ? "#fde68a"
                                    : entry.recommendation === "avoid"
                                      ? "#fca5a5"
                                      : "rgba(248,250,252,0.52)",
                                fontSize: 11,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {RECOMMENDATION_LABEL[entry.recommendation]}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: 5,
                              color: "rgba(248,250,252,0.55)",
                              fontSize: 11,
                              lineHeight: 1.35,
                            }}
                          >
                            {entry.purpose}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 5,
                              marginTop: 6,
                            }}
                          >
                            <span
                              style={{
                                borderRadius: 999,
                                background: "rgba(96,165,250,0.14)",
                                color: "#bfdbfe",
                                padding: "2px 6px",
                                fontSize: 10,
                              }}
                            >
                              {SOURCE_LABEL[getActionSource(entry)]}
                            </span>
                            <span
                              style={{
                                borderRadius: 999,
                                background:
                                  getActionStatus(entry) === "blocked"
                                    ? "rgba(248,113,113,0.15)"
                                    : getActionStatus(entry) === "installed"
                                      ? "rgba(34,197,94,0.14)"
                                      : "rgba(251,191,36,0.14)",
                                color:
                                  getActionStatus(entry) === "blocked"
                                    ? "#fecaca"
                                    : getActionStatus(entry) === "installed"
                                      ? "#bbf7d0"
                                      : "#fde68a",
                                padding: "2px 6px",
                                fontSize: 10,
                              }}
                            >
                              {ASSET_STATUS_LABEL[getActionStatus(entry)]}
                            </span>
                            {getActionUsageTags(entry)
                              .slice(0, 5)
                              .map((tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    borderRadius: 999,
                                    background: "rgba(255,255,255,0.07)",
                                    color: "rgba(248,250,252,0.68)",
                                    padding: "2px 6px",
                                    fontSize: 10,
                                  }}
                                >
                                  {USAGE_LABEL[tag]}
                                </span>
                              ))}
                          </div>
                          {entry.clipName ? (
                            <div
                              style={{
                                marginTop: 4,
                                color: "rgba(147,197,253,0.72)",
                                fontSize: 10,
                              }}
                            >
                              {entry.library?.toUpperCase()} / {entry.clipName}
                            </div>
                          ) : null}
                          <div
                            style={{
                              marginTop: 4,
                              color:
                                getOfficeFit(entry).tone === "partial"
                                  ? "#fde68a"
                                  : getOfficeFit(entry).tone === "good"
                                    ? "#86efac"
                                    : "rgba(248,250,252,0.42)",
                              fontSize: 10,
                            }}
                          >
                            办公适配：{getOfficeFit(entry).label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(248,250,252,0.55)",
                  fontWeight: 700,
                }}
              >
                视角
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                {(["thirdPerson", "firstPerson"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCameraMode(mode)}
                    style={{
                      borderRadius: 9,
                      border:
                        cameraMode === mode
                          ? "1px solid rgba(251,191,36,0.9)"
                          : "1px solid rgba(255,255,255,0.1)",
                      background:
                        cameraMode === mode
                          ? "rgba(251,191,36,0.14)"
                          : "rgba(255,255,255,0.04)",
                      color: "#f8fafc",
                      padding: "8px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {mode === "thirdPerson" ? "第三视角" : "第一视角"}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </aside>

          <main style={{ position: "relative", minHeight: 0 }}>
            <AvatarLabErrorBoundary>
              <Canvas
                shadows
                camera={{
                  position: [0.9, 0.95, 2.2],
                  fov: 42,
                  near: 0.02,
                  far: 20,
                }}
                gl={{ antialias: true, alpha: false }}
                style={{ width: "100%", height: "100%", background: "#1f2937" }}
              >
                <color attach="background" args={["#1f2937"]} />
                <ambientLight intensity={0.75} />
                <directionalLight position={[2, 3, 2]} intensity={1.5} castShadow />
                <pointLight position={[-1.5, 1.5, 1.2]} intensity={0.55} />
                <Suspense fallback={null}>
                  {labMode === "auditionStage" ? (
                    <AvatarAuditionStage chain={selectedAuditionChain} />
                  ) : (
                    <AvatarPreview
                      modelId={modelId}
                      action={selectedAction}
                      cameraMode={cameraMode}
                    />
                  )}
                </Suspense>
                <OrbitControls
                  enablePan={false}
                  target={[0, 0.45, 0]}
                  minDistance={0.8}
                  maxDistance={4}
                  maxPolarAngle={Math.PI * 0.48}
                />
              </Canvas>
            </AvatarLabErrorBoundary>

            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                maxWidth: "min(560px, 52vw)",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(15,23,42,0.68)",
                padding: 8,
                display: "grid",
                gap: 7,
                pointerEvents: "auto",
              }}
            >
              {([
                ["player", "玩家动作", playerQueueActions, "#38bdf8"],
                ["agent", "智能体动作", agentQueueActions, "#c084fc"],
              ] as const).map(([actor, label, actions, color]) => (
                <div
                  key={actor}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      color: "rgba(248,250,252,0.68)",
                      fontSize: 11,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 5,
                      justifyContent: "flex-end",
                      minWidth: 0,
                    }}
                  >
                    {actions.length === 0 ? (
                      <span
                        style={{
                          color: "rgba(248,250,252,0.4)",
                          fontSize: 11,
                        }}
                      >
                        未加入
                      </span>
                    ) : (
                      actions.map((action) => {
                        const active =
                          activePreview.actor === actor &&
                          activePreview.actionId === action.id;
                        return (
                          <span
                            key={`${actor}:${action.id}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              borderRadius: 999,
                              border: active
                                ? `1px solid ${color}`
                                : "1px solid rgba(255,255,255,0.12)",
                              background: active
                                ? "rgba(255,255,255,0.12)"
                                : "rgba(255,255,255,0.06)",
                              maxWidth: 180,
                              overflow: "hidden",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                previewQueuedAction(actor, action.id)
                              }
                              title={action.label}
                              style={{
                                border: 0,
                                background: "transparent",
                                color: active ? "#f8fafc" : "rgba(248,250,252,0.76)",
                                padding: "4px 0 4px 8px",
                                cursor: "pointer",
                                fontSize: 11,
                                fontWeight: 800,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {action.label}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeQueuedAction(actor, action.id)}
                              title="删除动作"
                              style={{
                                border: 0,
                                background: "rgba(15,23,42,0.45)",
                                color: "rgba(248,250,252,0.74)",
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                cursor: "pointer",
                                fontSize: 12,
                                lineHeight: "18px",
                                padding: 0,
                                marginRight: 3,
                              }}
                            >
                              x
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                position: "absolute",
                left: 18,
                top: 18,
                maxWidth: labMode === "auditionStage" ? 360 : 390,
                borderRadius: 12,
                padding: "10px 12px",
                background:
                  labMode === "auditionStage"
                    ? "rgba(15, 23, 42, 0.58)"
                    : getActionStatus(selectedAction) === "installed"
                    ? "rgba(15, 23, 42, 0.68)"
                    : "rgba(120, 53, 15, 0.84)",
                border:
                  labMode === "auditionStage"
                    ? "1px solid rgba(96,165,250,0.22)"
                    : getActionStatus(selectedAction) === "installed"
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "1px solid rgba(251,191,36,0.34)",
                color:
                  labMode === "auditionStage"
                    ? "rgba(248,250,252,0.78)"
                    : getActionStatus(selectedAction) === "installed"
                    ? "rgba(248,250,252,0.72)"
                    : "#fde68a",
                fontSize: 12,
                lineHeight: 1.45,
                pointerEvents: "none",
              }}
            >
              {labMode === "auditionStage" ? (
                <>
                  <strong>试演场：{selectedAuditionChain.label}</strong>
                  <div
                    style={{
                      marginTop: 4,
                      color: "rgba(248,250,252,0.64)",
                    }}
                  >
                    {selectedAuditionChain.steps.length} 步动作链；
                    {selectedAuditionChain.decision === "candidate"
                      ? "可作为接入候选。"
                      : "继续留在实验室。"}
                    已启用试演场碰撞代理。
                  </div>
                </>
              ) : getActionStatus(selectedAction) === "installed" ? (
                "当前预览播放的是已安装动作。"
              ) : (
                "当前条目只在候选池里：这里显示默认姿态/回退动作，不代表真实候选动画已经安装。"
              )}
            </div>

            {labMode === "assetPool" ? (
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  bottom: 18,
                  right: 18,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  pointerEvents: "none",
                }}
              >
              <div
                style={{
                  maxWidth: 560,
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f8fafc",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
                }}
              >
                <strong>{selectedModel.label}</strong>
                <div
                  style={{
                    marginTop: 5,
                    color: "rgba(248,250,252,0.7)",
                    fontSize: 13,
                  }}
                >
                  {selectedModel.description}
                </div>
              </div>
              <div
                style={{
                  maxWidth: 420,
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f8fafc",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
              }}
            >
              <strong>{selectedAction.label}</strong>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 7,
                }}
              >
                <span
                  style={{
                    borderRadius: 999,
                    background: "rgba(96,165,250,0.14)",
                    color: "#bfdbfe",
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {SOURCE_LABEL[getActionSource(selectedAction)]}
                </span>
                <span
                  style={{
                    borderRadius: 999,
                    background:
                      getActionStatus(selectedAction) === "blocked"
                        ? "rgba(248,113,113,0.15)"
                        : getActionStatus(selectedAction) === "installed"
                          ? "rgba(34,197,94,0.14)"
                          : "rgba(251,191,36,0.14)",
                    color:
                      getActionStatus(selectedAction) === "blocked"
                        ? "#fecaca"
                        : getActionStatus(selectedAction) === "installed"
                          ? "#bbf7d0"
                          : "#fde68a",
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {ASSET_STATUS_LABEL[getActionStatus(selectedAction)]}
                </span>
                {getActionUsageTags(selectedAction).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.07)",
                      color: "rgba(248,250,252,0.72)",
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {USAGE_LABEL[tag]}
                  </span>
                ))}
              </div>
              <div
                style={{
                  marginTop: 7,
                    display: "inline-flex",
                    borderRadius: 999,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 800,
                    color:
                      selectedOfficeFit.tone === "good"
                        ? "#bbf7d0"
                        : selectedOfficeFit.tone === "partial"
                          ? "#fde68a"
                          : "#fecaca",
                    background:
                      selectedOfficeFit.tone === "good"
                        ? "rgba(34,197,94,0.14)"
                        : selectedOfficeFit.tone === "partial"
                          ? "rgba(251,191,36,0.14)"
                          : "rgba(248,113,113,0.12)",
                    border:
                      selectedOfficeFit.tone === "good"
                        ? "1px solid rgba(34,197,94,0.26)"
                        : selectedOfficeFit.tone === "partial"
                          ? "1px solid rgba(251,191,36,0.28)"
                          : "1px solid rgba(248,113,113,0.24)",
                  }}
                >
                  办公适配：{selectedOfficeFit.label}
                </div>
                <div
                  style={{
                    marginTop: 5,
                    color: "rgba(248,250,252,0.7)",
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  {selectedAction.purpose}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color:
                      selectedOfficeFit.tone === "partial"
                        ? "#fde68a"
                        : selectedOfficeFit.tone === "good"
                          ? "#86efac"
                          : "rgba(248,250,252,0.6)",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {selectedOfficeFit.detail}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(147,197,253,0.76)",
                    fontSize: 12,
                  }}
                >
                  {selectedAction.note}
                </div>
                {selectedAction.licenseNote ||
                selectedAction.packagingNote ||
                selectedAction.previewNote ? (
                  <div
                    style={{
                      marginTop: 8,
                      display: "grid",
                      gap: 4,
                      color: "rgba(248,250,252,0.66)",
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedAction.licenseNote ? (
                      <div>许可：{selectedAction.licenseNote}</div>
                    ) : null}
                    {selectedAction.packagingNote ? (
                      <div>打包：{selectedAction.packagingNote}</div>
                    ) : null}
                    {selectedAction.previewNote ? (
                      <div>预览：{selectedAction.previewNote}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              </div>
            ) : null}
          </main>
        </div>
      </section>
      {contextMenu ? (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 140,
            minWidth: 180,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(15,23,42,0.98)",
            boxShadow: "0 16px 42px rgba(0,0,0,0.42)",
            padding: 6,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            style={{
              padding: "6px 8px",
              color: "rgba(248,250,252,0.58)",
              fontSize: 11,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              marginBottom: 4,
            }}
          >
            已选 {contextMenu.actionIds.length} 个动作
          </div>
          {[
            ["player", "加入玩家动作", "rgba(56,189,248,0.14)", "#bae6fd"],
            ["agent", "加入智能体动作", "rgba(168,85,247,0.16)", "#e9d5ff"],
          ].map(([actor, label, background, color]) => (
            <button
              key={actor}
              type="button"
              onClick={() =>
                addActionsToQueue(
                  actor as AvatarLabAuditionActor,
                  contextMenu.actionIds,
                )
              }
              style={{
                display: "block",
                width: "100%",
                border: "1px solid transparent",
                borderRadius: 8,
                background,
                color,
                padding: "8px 9px",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default AvatarLab;
