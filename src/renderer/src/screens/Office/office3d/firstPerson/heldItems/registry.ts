import type {
  FirstPersonSocketName,
  FirstPersonTransformConfig,
  HandAction,
  HeldItemKind,
} from "../types";
import bookUrl from "../../assets/assets-realistic/props/folder.glb?url";
import taskCardUrl from "../../assets/assets-realistic/props/task_card.glb?url";
import tabletUrl from "../../assets/assets-realistic/props/tablet.glb?url";
import toolUrl from "../../assets/assets-realistic/props/wrench.glb?url";

export interface HeldItemDefinition {
  kind: Exclude<HeldItemKind, "none">;
  assetUrl: string;
  primarySocket: FirstPersonSocketName;
  secondarySocket?: FirstPersonSocketName;
  transform: FirstPersonTransformConfig;
  preferredAction: HandAction;
}

export const HELD_ITEM_REGISTRY: Record<
  Exclude<HeldItemKind, "none">,
  HeldItemDefinition
> = {
  book: {
    kind: "book",
    assetUrl: bookUrl,
    primarySocket: "rightGrip",
    secondarySocket: "leftGrip",
    transform: {
      position: [0.015, -0.03, -0.12],
      rotation: [0.15, 0.08, -0.2],
      scale: 0.72,
    },
    preferredAction: "hold_two_hand",
  },
  taskCard: {
    kind: "taskCard",
    assetUrl: taskCardUrl,
    primarySocket: "rightGrip",
    transform: {
      position: [0.02, -0.018, -0.09],
      rotation: [0.12, 0.12, -0.1],
      scale: 0.86,
    },
    preferredAction: "hold_one_hand",
  },
  tablet: {
    kind: "tablet",
    assetUrl: tabletUrl,
    primarySocket: "rightGrip",
    secondarySocket: "leftGrip",
    transform: {
      position: [0.02, -0.04, -0.16],
      rotation: [0.22, 0, -0.06],
      scale: 0.58,
    },
    preferredAction: "hold_two_hand",
  },
  tool: {
    kind: "tool",
    assetUrl: toolUrl,
    primarySocket: "rightGrip",
    transform: {
      position: [0.015, -0.02, -0.12],
      rotation: [0.12, 0.26, -0.26],
      scale: 0.68,
    },
    preferredAction: "hold_one_hand",
  },
};
