import type {
  FirstPersonInteractionProfile,
  HandAction,
  HeldItemKind,
} from "./types";
import { HELD_ITEM_REGISTRY } from "./heldItems/registry";

export const HELD_ITEM_KEYS: Record<string, HeldItemKind> = {
  Digit1: "none",
  Digit2: "book",
  Digit3: "taskCard",
  Digit4: "tablet",
  Digit5: "tool",
};

export const INVENTORY_ITEMS: Array<{
  key: string;
  item: HeldItemKind;
  label: string;
  description: string;
}> = [
  { key: "1", item: "none", label: "空手", description: "收起当前道具" },
  {
    key: "2",
    item: "book",
    label: "资料册",
    description: "从书架或记忆库拿取资料",
  },
  {
    key: "3",
    item: "taskCard",
    label: "任务卡",
    description: "查看任务、白板和工位屏幕",
  },
  {
    key: "4",
    item: "tablet",
    label: "平板",
    description: "查看模型、网关和状态面板",
  },
  {
    key: "5",
    item: "tool",
    label: "工具",
    description: "工具室道具，用于场景交互",
  },
];

export const HAND_ACTION_LABELS: Record<HandAction, string> = {
  idle: "待机",
  walk: "行走",
  jump: "跳跃",
  click: "点击",
  reach_mid: "伸手",
  reach_high: "高处拿取",
  pickup_floor: "拾取",
  grab_shelf: "拿资料",
  hold_one_hand: "单手持物",
  hold_two_hand: "双手持物",
  put_away: "放下道具",
  inspect: "查看道具",
  reach: "伸手",
  grab: "拿取",
  press: "按下",
  point: "指向",
  holdItem: "持物",
  putAway: "放下",
};

export function labelForHeldItem(item: HeldItemKind): string {
  return INVENTORY_ITEMS.find((entry) => entry.item === item)?.label ?? item;
}

export function labelForHandAction(action: HandAction): string {
  return HAND_ACTION_LABELS[action] ?? action;
}

export function actionForHeldItem(item: HeldItemKind): HandAction {
  if (item === "none") return "put_away";
  return HELD_ITEM_REGISTRY[item]?.preferredAction ?? "hold_one_hand";
}

export function actionForInteraction({
  heldItem,
  interactionKind,
  profile,
}: {
  heldItem?: HeldItemKind;
  interactionKind?: string;
  profile?: FirstPersonInteractionProfile;
}): { action: HandAction; heldItem: HeldItemKind } {
  const nextItem = profile?.heldItem ?? heldItem ?? "none";
  if (profile?.action) {
    return { action: profile.action, heldItem: nextItem };
  }

  if (interactionKind === "workstation-screen" || profile?.kind === "screen") {
    return { action: "click", heldItem: nextItem };
  }

  switch (profile?.kind) {
    case "shelf":
      return {
        action: "grab_shelf",
        heldItem: nextItem === "none" ? "book" : nextItem,
      };
    case "floor":
      return { action: "pickup_floor", heldItem: nextItem };
    case "tool":
      return {
        action: "hold_one_hand",
        heldItem: nextItem === "none" ? "tool" : nextItem,
      };
    case "button":
    case "door":
      return { action: "reach_mid", heldItem: nextItem };
    default:
      break;
  }

  if (heldItem) {
    return { action: actionForHeldItem(heldItem), heldItem: nextItem };
  }
  return { action: "click", heldItem: nextItem };
}

export function interactionHintFor({
  heldItem,
  profile,
  interactionKind,
}: {
  heldItem: HeldItemKind;
  profile?: FirstPersonInteractionProfile;
  interactionKind?: string;
}): string | undefined {
  const hasTarget = Boolean(profile?.label ?? interactionKind);
  if (!hasTarget) {
    return heldItem === "none"
      ? undefined
      : `左键使用 · 右键放下${labelForHeldItem(heldItem)}`;
  }

  if (profile?.kind === "vehicle") {
    return "E \u4e0a\u8f66";
  }

  const willPickUp =
    Boolean(profile?.heldItem) &&
    profile?.heldItem !== heldItem &&
    profile?.kind !== "screen" &&
    interactionKind !== "workstation-screen";
  const useText = willPickUp ? "左键/E 拿起" : "左键/E 使用";
  return heldItem === "none"
    ? useText
    : `${useText} · 右键放下${labelForHeldItem(heldItem)}`;
}

export function fallbackPoseFor(action: HandAction): HandAction {
  switch (action) {
    case "click":
      return "press";
    case "reach_mid":
    case "reach_high":
      return "reach";
    case "pickup_floor":
    case "grab_shelf":
      return "grab";
    case "hold_one_hand":
    case "hold_two_hand":
      return "holdItem";
    case "put_away":
      return "putAway";
    default:
      return action;
  }
}
