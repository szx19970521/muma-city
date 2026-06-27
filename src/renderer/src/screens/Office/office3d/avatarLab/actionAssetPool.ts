export type ActionAssetSource =
  | "quaternius"
  | "cmu"
  | "rokoko"
  | "mixamo"
  | "unavailable";

export type ActionAssetSourceFilter = "all" | ActionAssetSource;

export type ActionUsageTag =
  | "player"
  | "agent"
  | "npc"
  | "office"
  | "rest"
  | "street"
  | "restaurant";

export type ActionUsageFilter = "all" | ActionUsageTag;

export type ActionAssetStatus = "installed" | "candidate" | "manual" | "blocked";

export type ActionAssetRecommendation = "core" | "useful" | "later" | "avoid";

export type ActionAssetCategory = "player" | "agent" | "npc" | "unused";

export type ActionAssetState =
  | "standing"
  | "walking"
  | "sitting"
  | "working_at_desk"
  | "talking_to_player"
  | "opening_door"
  | "using_memory"
  | "using_tools"
  | "dancing";

export type ActionAssetCandidate = {
  id: string;
  label: string;
  originalName: string;
  source: Exclude<ActionAssetSource, "quaternius">;
  status: ActionAssetStatus;
  recommendation: ActionAssetRecommendation;
  usageTags: ActionUsageTag[];
  category: ActionAssetCategory;
  state: ActionAssetState;
  purpose: string;
  licenseNote: string;
  packagingNote: string;
  previewNote: string;
};

export const ACTION_SOURCE_LABEL: Record<ActionAssetSourceFilter, string> = {
  all: "全部来源",
  quaternius: "Quaternius",
  cmu: "CMU",
  rokoko: "Rokoko",
  mixamo: "Mixamo候选",
  unavailable: "不可用",
};

export const ACTION_USAGE_LABEL: Record<ActionUsageFilter, string> = {
  all: "全部用途",
  player: "玩家",
  agent: "智能体",
  npc: "NPC",
  office: "办公",
  rest: "休息",
  street: "街道",
  restaurant: "餐厅",
};

export const ACTION_ASSET_STATUS_LABEL: Record<ActionAssetStatus, string> = {
  installed: "已安装",
  candidate: "候选",
  manual: "人工精选",
  blocked: "暂不纳入",
};

export const ACTION_SOURCE_ORDER: ActionAssetSourceFilter[] = [
  "all",
  "quaternius",
  "cmu",
  "rokoko",
  "mixamo",
  "unavailable",
];

export const ACTION_USAGE_ORDER: ActionUsageFilter[] = [
  "all",
  "player",
  "agent",
  "npc",
  "office",
  "rest",
  "street",
  "restaurant",
];

export const EXTERNAL_ACTION_ASSET_CANDIDATES: ActionAssetCandidate[] = [
  {
    id: "cmu:typing-laptop",
    label: "坐姿笔记本打字",
    originalName: "typing on a laptop",
    source: "cmu",
    status: "candidate",
    recommendation: "core",
    usageTags: ["player", "agent", "npc", "office"],
    category: "agent",
    state: "working_at_desk",
    purpose: "最接近工位办公的免费候选，可用于智能体坐在电脑前打字。",
    licenseNote: "CMU Mocap 官方数据可免费用于研究和商业项目，仍需保留来源记录。",
    packagingNote: "原始 ASF/AMC 需要转换、清洗和重定向后才能进入应用。",
    previewNote: "未安装。先作为办公动作 POC 的优先检索目标。",
  },
  {
    id: "cmu:phone-answer",
    label: "接电话/拨电话",
    originalName: "answering or dialing phone",
    source: "cmu",
    status: "candidate",
    recommendation: "core",
    usageTags: ["agent", "npc", "office", "street"],
    category: "agent",
    state: "talking_to_player",
    purpose: "可用于通讯中心、智能体处理中断、路人打电话。",
    licenseNote: "CMU 免费用途较宽，但需要保留来源和转换链。",
    packagingNote: "需要从 CMU 原始格式转为可重定向动画。",
    previewNote: "未安装。适合第二批补办公氛围。",
  },
  {
    id: "cmu:write-board",
    label: "白板书写",
    originalName: "writing on a chalkboard",
    source: "cmu",
    status: "candidate",
    recommendation: "useful",
    usageTags: ["agent", "npc", "office"],
    category: "agent",
    state: "using_tools",
    purpose: "可用于会议室讲解、白板计划、智能体汇报。",
    licenseNote: "CMU 免费用途较宽，需要记录来源。",
    packagingNote: "需要裁剪和道具对齐，不适合直接进主场景。",
    previewNote: "未安装。会议室专项时再转换。",
  },
  {
    id: "cmu:pickup-floor",
    label: "弯腰拾取",
    originalName: "picking up something",
    source: "cmu",
    status: "candidate",
    recommendation: "useful",
    usageTags: ["player", "agent", "npc", "office", "restaurant"],
    category: "player",
    state: "using_tools",
    purpose: "可用于玩家拾取道具、服务员捡物、智能体整理物品。",
    licenseNote: "CMU 免费用途较宽，需要记录来源。",
    packagingNote: "需要处理地面高度和手部接触点。",
    previewNote: "未安装。适合第一批交互动作用 POC。",
  },
  {
    id: "cmu:handshake",
    label: "握手",
    originalName: "hand shake",
    source: "cmu",
    status: "candidate",
    recommendation: "later",
    usageTags: ["player", "agent", "npc", "office"],
    category: "npc",
    state: "talking_to_player",
    purpose: "可用于访客、会议、商务交流，不是第一阶段刚需。",
    licenseNote: "CMU 免费用途较宽，双人动作需要额外检查。",
    packagingNote: "双人同步动作需要位置对齐，先不进核心池。",
    previewNote: "未安装。后续社交动作池再评估。",
  },
  {
    id: "rokoko:everyday-idle",
    label: "自然站立待机",
    originalName: "Everyday idle animations",
    source: "rokoko",
    status: "candidate",
    recommendation: "core",
    usageTags: ["player", "agent", "npc", "office", "street", "restaurant"],
    category: "npc",
    state: "standing",
    purpose: "用于减少所有人同一个 idle 的机械感。",
    licenseNote: "Rokoko 免费资源页面声明可用于商业项目，下载前需要保存许可证明。",
    packagingNote: "只纳入精选动作，不把整个资源包作为可下载素材库分发。",
    previewNote: "未安装。适合做高质量氛围补充。",
  },
  {
    id: "rokoko:phone-idle",
    label: "看手机/打电话",
    originalName: "Phone idle or call candidate",
    source: "rokoko",
    status: "candidate",
    recommendation: "useful",
    usageTags: ["player", "agent", "npc", "rest", "street", "office"],
    category: "npc",
    state: "talking_to_player",
    purpose: "适合街道 NPC、休息区、通讯中心氛围。",
    licenseNote: "Rokoko 免费资源需要保留下载页和许可记录。",
    packagingNote: "需要人工确认具体动作名，并只纳入精选动作。",
    previewNote: "未安装。先作为检索目标。",
  },
  {
    id: "rokoko:wait-line",
    label: "排队等待",
    originalName: "Waiting idle candidate",
    source: "rokoko",
    status: "candidate",
    recommendation: "useful",
    usageTags: ["npc", "street", "restaurant", "office"],
    category: "npc",
    state: "standing",
    purpose: "可用于餐厅排队、路边等待、访客等待。",
    licenseNote: "Rokoko 免费资源需要保留许可记录。",
    packagingNote: "人工精选后再转入本地资产。",
    previewNote: "未安装。属于城市氛围动作。",
  },
  {
    id: "rokoko:serve-counter",
    label: "服务员柜台操作",
    originalName: "Counter service candidate",
    source: "rokoko",
    status: "candidate",
    recommendation: "later",
    usageTags: ["npc", "restaurant"],
    category: "npc",
    state: "using_tools",
    purpose: "可用于小马餐厅服务员点餐、收银、递餐。",
    licenseNote: "Rokoko 免费资源需要确认具体动作包。",
    packagingNote: "依赖柜台、托盘、餐具对齐，先不进核心池。",
    previewNote: "未安装。餐厅专项再处理。",
  },
  {
    id: "mixamo:typing",
    label: "坐姿打字",
    originalName: "Typing",
    source: "mixamo",
    status: "manual",
    recommendation: "core",
    usageTags: ["player", "agent", "npc", "office"],
    category: "agent",
    state: "working_at_desk",
    purpose: "最直接的键盘办公候选，用于智能体工位工作实验。",
    licenseNote: "Mixamo 可用于商业成品，但不要把原始动画当素材包分发。",
    packagingNote: "只能人工精选少量并嵌入作品，不做全量动作库。",
    previewNote: "未安装。需要登录 Mixamo 手动下载并做许可留档。",
  },
  {
    id: "mixamo:sit-to-type",
    label: "坐下开始打字",
    originalName: "Sit To Type",
    source: "mixamo",
    status: "manual",
    recommendation: "useful",
    usageTags: ["agent", "npc", "office"],
    category: "agent",
    state: "sitting",
    purpose: "可做智能体到达工位后的过渡动作。",
    licenseNote: "Mixamo 需要按 Adobe 许可谨慎使用。",
    packagingNote: "人工精选，并和椅子高度、桌面位置一起校准。",
    previewNote: "未安装。工位 POC 时再下载。",
  },
  {
    id: "mixamo:type-to-sit",
    label: "停止打字坐好",
    originalName: "Type To Sit",
    source: "mixamo",
    status: "manual",
    recommendation: "useful",
    usageTags: ["agent", "npc", "office"],
    category: "agent",
    state: "sitting",
    purpose: "可用于智能体停止工作、转向玩家或对话前的过渡。",
    licenseNote: "Mixamo 需要按 Adobe 许可谨慎使用。",
    packagingNote: "人工精选后嵌入作品，不做全量分发。",
    previewNote: "未安装。工位 POC 时再下载。",
  },
  {
    id: "mixamo:filing-cabinet",
    label: "文件柜操作",
    originalName: "Filing cabinet candidate",
    source: "mixamo",
    status: "manual",
    recommendation: "useful",
    usageTags: ["agent", "npc", "office"],
    category: "agent",
    state: "using_memory",
    purpose: "可用于记忆库、档案柜、资料查找。",
    licenseNote: "Mixamo 只做人工精选，不纳入可下载动作库。",
    packagingNote: "需要对齐柜子高度和手部接触点。",
    previewNote: "未安装。记忆库专项再下载。",
  },
  {
    id: "mixamo:sitting-talk",
    label: "坐姿交谈",
    originalName: "Sitting talking candidate",
    source: "mixamo",
    status: "manual",
    recommendation: "useful",
    usageTags: ["agent", "npc", "office", "rest", "restaurant"],
    category: "npc",
    state: "talking_to_player",
    purpose: "可用于会议、休息区、餐厅聊天。",
    licenseNote: "Mixamo 只做人工精选，不纳入可下载动作库。",
    packagingNote: "人工精选后嵌入成品。",
    previewNote: "未安装。社交动作池再下载。",
  },
  {
    id: "unavailable:bandai-namco",
    label: "Bandai Namco 大型动作库",
    originalName: "Bandai Namco Research Motion Dataset",
    source: "unavailable",
    status: "blocked",
    recommendation: "avoid",
    usageTags: ["player", "agent", "npc"],
    category: "unused",
    state: "standing",
    purpose: "动作数量大，但非商业限制不适合牧马城市。",
    licenseNote: "许可含非商业限制，不能用于当前商业化产品路线。",
    packagingNote: "不进入下载、打包或主场景。",
    previewNote: "仅保留为不可用记录，避免后续误用。",
  },
  {
    id: "unavailable:epic-sample",
    label: "Epic Game Animation Sample",
    originalName: "Epic Game Animation Sample Project",
    source: "unavailable",
    status: "blocked",
    recommendation: "avoid",
    usageTags: ["player", "npc"],
    category: "unused",
    state: "standing",
    purpose: "质量高，但跨引擎和 Electron 打包许可风险较大。",
    licenseNote: "Epic/UE 内容许可不适合作为 Three.js/Electron 动作池。",
    packagingNote: "不进入当前资源路线。",
    previewNote: "仅保留为不可用记录。",
  },
  {
    id: "unavailable:actorcore-paid-office",
    label: "ActorCore 办公付费包",
    originalName: "ActorCore Office Work",
    source: "unavailable",
    status: "blocked",
    recommendation: "avoid",
    usageTags: ["agent", "npc", "office"],
    category: "unused",
    state: "working_at_desk",
    purpose: "动作很贴合办公，但不是免费资产，本轮不纳入。",
    licenseNote: "付费授权，且原始素材再分发有明确限制。",
    packagingNote: "只作为质量参考，不进入免费资源池。",
    previewNote: "仅保留为不可用记录。",
  },
];

export function filterActionAssetCandidates(
  source: ActionAssetSourceFilter,
  usage: ActionUsageFilter,
): ActionAssetCandidate[] {
  return EXTERNAL_ACTION_ASSET_CANDIDATES.filter((entry) => {
    const sourceMatches = source === "all" || entry.source === source;
    const usageMatches = usage === "all" || entry.usageTags.includes(usage);
    return sourceMatches && usageMatches;
  });
}
