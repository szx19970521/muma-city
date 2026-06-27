import { useCallback, useEffect, useRef, useState } from "react";
import { Suspense } from "react";
import { FirstPersonAvatar } from "./FirstPersonAvatar";
import { FirstPersonController } from "./FirstPersonController";
import { FPS_START } from "./FirstPersonController";
import { PlayerThirdPersonCharacter } from "./PlayerThirdPersonCharacter";
import type {
  FirstPersonHudState,
  FirstPersonMotionState,
  FirstPersonPlayerPose,
  FirstPersonViewMode,
  HandAction,
  HandActionEvent,
  HeldItemKind,
} from "./types";
import { actionForHeldItem, labelForHeldItem } from "./interactionMapping";

const DEFAULT_MOTION: FirstPersonMotionState = {
  moving: false,
  pitch: 0,
  sprinting: false,
};

const DEFAULT_PLAYER_POSE: FirstPersonPlayerPose = {
  position: [FPS_START[0], 0, FPS_START[2]],
  yaw: Math.PI,
  pitch: 0,
  moving: false,
  sprinting: false,
  jumping: false,
  verticalOffset: 0,
  viewMode: "firstPerson",
};

const DEFAULT_ACTION: HandActionEvent = {
  tick: 0,
  action: "idle",
  heldItem: "none",
};

const LOOPING_ACTIONS = new Set<HandAction>([
  "idle",
  "walk",
  "hold_one_hand",
  "hold_two_hand",
  "holdItem",
]);

function settleActionFor(item: HeldItemKind, moving: boolean): HandAction {
  if (moving) return "walk";
  return item === "none" ? "idle" : actionForHeldItem(item);
}

export function FirstPersonSystem({
  inputEnabled = true,
  onSceneMissed,
  onHudStateChange,
  selectedItemRequest,
}: {
  inputEnabled?: boolean;
  onSceneMissed?: () => void;
  onHudStateChange?: (patch: Partial<FirstPersonHudState>) => void;
  selectedItemRequest?: { item: HeldItemKind; tick: number };
}): React.JSX.Element {
  const [heldItem, setHeldItem] = useState<HeldItemKind>("none");
  const [motion, setMotion] = useState<FirstPersonMotionState>(DEFAULT_MOTION);
  const [action, setAction] = useState<HandActionEvent>(DEFAULT_ACTION);
  const [viewMode, setViewMode] =
    useState<FirstPersonViewMode>("firstPerson");
  const lastSelectionTickRef = useRef(-1);
  const playerPoseRef = useRef<FirstPersonPlayerPose>({
    ...DEFAULT_PLAYER_POSE,
  });

  const triggerAction = useCallback(
    (nextAction: HandAction, itemOverride?: HeldItemKind): void => {
      setAction((current) => ({
        tick: current.tick + 1,
        action: nextAction,
        heldItem: itemOverride ?? heldItem,
      }));
    },
    [heldItem],
  );

  const changeHeldItem = useCallback((nextItem: HeldItemKind): void => {
    setHeldItem(nextItem);
    onHudStateChange?.({ heldItem: nextItem });
  }, [onHudStateChange]);

  const changeHudState = useCallback(
    (patch: Partial<FirstPersonHudState>): void => {
      onHudStateChange?.(patch);
    },
    [onHudStateChange],
  );

  const changeMotion = useCallback((nextMotion: FirstPersonMotionState): void => {
    setMotion(nextMotion);
    onHudStateChange?.({ motion: nextMotion });
  }, [onHudStateChange]);

  useEffect(() => {
    if (
      !selectedItemRequest ||
      selectedItemRequest.tick === lastSelectionTickRef.current
    ) {
      return;
    }
    lastSelectionTickRef.current = selectedItemRequest.tick;
    const nextItem = selectedItemRequest.item;
    const nextAction = actionForHeldItem(nextItem);
    setHeldItem(nextItem);
    setAction((current) => ({
      tick: current.tick + 1,
      action: nextAction,
      heldItem: nextItem,
    }));
    onHudStateChange?.({
      heldItem: nextItem,
      lastAction: nextAction,
      focusedTarget: undefined,
      interactionHint:
        nextItem === "none"
          ? "已切换为空手"
          : `已装备${labelForHeldItem(nextItem)}`,
      interactionHintMode: "toast",
    });
  }, [onHudStateChange, selectedItemRequest]);

  useEffect(() => {
    if (LOOPING_ACTIONS.has(action.action)) return;
    const actionTick = action.tick;
    const timeout = window.setTimeout(() => {
      setAction((current) => {
        if (current.tick !== actionTick) return current;
        const nextAction = settleActionFor(heldItem, motion.moving);
        onHudStateChange?.({ lastAction: nextAction });
        return {
          tick: current.tick + 1,
          action: nextAction,
          heldItem,
        };
      });
    }, 620);
    return () => window.clearTimeout(timeout);
  }, [action.action, action.tick, heldItem, motion.moving, onHudStateChange]);

  return (
    <>
      <FirstPersonController
        inputEnabled={inputEnabled}
        onAction={triggerAction}
        onHeldItemChange={changeHeldItem}
        onMotionChange={changeMotion}
        onSceneMissed={onSceneMissed}
        onHudStateChange={changeHudState}
        selectedItemRequest={selectedItemRequest}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        playerPoseRef={playerPoseRef}
      />
      {viewMode === "firstPerson" ? (
        <FirstPersonAvatar action={action} motion={motion} />
      ) : null}
      <Suspense fallback={null}>
        <PlayerThirdPersonCharacter poseRef={playerPoseRef} />
      </Suspense>
    </>
  );
}

