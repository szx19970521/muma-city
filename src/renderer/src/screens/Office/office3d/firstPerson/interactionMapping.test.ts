import { describe, expect, it } from "vitest";
import {
  actionForHeldItem,
  actionForInteraction,
  fallbackPoseFor,
  HELD_ITEM_KEYS,
  INVENTORY_ITEMS,
  interactionHintFor,
  labelForHandAction,
  labelForHeldItem,
} from "./interactionMapping";

describe("first-person interaction mapping", () => {
  it("keeps number keys mapped to stable inventory slots", () => {
    expect(HELD_ITEM_KEYS.Digit1).toBe("none");
    expect(HELD_ITEM_KEYS.Digit2).toBe("book");
    expect(HELD_ITEM_KEYS.Digit3).toBe("taskCard");
    expect(HELD_ITEM_KEYS.Digit4).toBe("tablet");
    expect(HELD_ITEM_KEYS.Digit5).toBe("tool");
    expect(INVENTORY_ITEMS.map((entry) => entry.item)).toEqual([
      "none",
      "book",
      "taskCard",
      "tablet",
      "tool",
    ]);
    expect(INVENTORY_ITEMS.map((entry) => entry.label)).toEqual([
      "空手",
      "资料册",
      "任务卡",
      "平板",
      "工具",
    ]);
  });

  it("maps held items to one-handed or two-handed poses", () => {
    expect(actionForHeldItem("none")).toBe("put_away");
    expect(actionForHeldItem("book")).toBe("hold_two_hand");
    expect(actionForHeldItem("taskCard")).toBe("hold_one_hand");
    expect(actionForHeldItem("tablet")).toBe("hold_two_hand");
    expect(actionForHeldItem("tool")).toBe("hold_one_hand");
  });

  it("uses interaction profiles for scene-specific actions", () => {
    expect(
      actionForInteraction({
        profile: { kind: "shelf", heldItem: "book", label: "记忆库" },
      }),
    ).toEqual({ action: "grab_shelf", heldItem: "book" });
    expect(
      actionForInteraction({
        profile: { kind: "floor", heldItem: "tool" },
      }),
    ).toEqual({ action: "pickup_floor", heldItem: "tool" });
    expect(
      actionForInteraction({
        interactionKind: "workstation-screen",
      }),
    ).toEqual({ action: "click", heldItem: "none" });
    expect(
      actionForInteraction({
        heldItem: "tool",
        interactionKind: "workstation-screen",
      }),
    ).toEqual({ action: "click", heldItem: "tool" });
    expect(
      actionForInteraction({
        profile: { kind: "tool" },
      }),
    ).toEqual({ action: "hold_one_hand", heldItem: "tool" });
    expect(
      actionForInteraction({
        profile: { kind: "button" },
      }),
    ).toEqual({ action: "reach_mid", heldItem: "none" });
    expect(
      actionForInteraction({
        profile: { kind: "door" },
      }),
    ).toEqual({ action: "reach_mid", heldItem: "none" });
    expect(
      actionForInteraction({
        heldItem: "tablet",
      }),
    ).toEqual({ action: "hold_two_hand", heldItem: "tablet" });
    expect(
      actionForInteraction({
        profile: { kind: "shelf", action: "inspect", heldItem: "book" },
      }),
    ).toEqual({ action: "inspect", heldItem: "book" });
  });

  it("keeps legacy fallback mappings available for older callers", () => {
    expect(fallbackPoseFor("click")).toBe("press");
    expect(fallbackPoseFor("grab_shelf")).toBe("grab");
    expect(fallbackPoseFor("hold_two_hand")).toBe("holdItem");
  });

  it("exposes readable Chinese labels for the first-person HUD", () => {
    expect(labelForHeldItem("tablet")).toBe("平板");
    expect(labelForHandAction("hold_two_hand")).toBe("双手持物");
    expect(labelForHandAction("pickup_floor")).toBe("拾取");
    expect(labelForHandAction("click")).toBe("点击");
  });

  it("builds target-aware player-facing interaction hints", () => {
    expect(interactionHintFor({ heldItem: "none" })).toBeUndefined();
    expect(interactionHintFor({ heldItem: "tool" })).toContain("右键放下工具");
    expect(
      interactionHintFor({
        heldItem: "none",
        profile: { kind: "shelf", heldItem: "book", label: "记忆库" },
      }),
    ).toContain("左键/E 拿起");
    expect(
      interactionHintFor({
        heldItem: "taskCard",
        profile: { kind: "screen", label: "任务屏幕" },
      }),
    ).toContain("左键/E 使用");
    expect(
      interactionHintFor({
        heldItem: "none",
        profile: { kind: "vehicle", label: "跑车" },
      }),
    ).toBe("E 上车");
  });
});
