import type { FirstPersonRigAdapter } from "./FirstPersonRigAdapter";
import type { FirstPersonMotionState, HandActionEvent } from "./types";

export interface FirstPersonArmsAnimator {
  playInitial: () => void;
  playEvent: (event: HandActionEvent) => void;
  update: (delta: number, motion: FirstPersonMotionState) => void;
}

export function createFirstPersonArmsAnimator(
  adapter: FirstPersonRigAdapter,
): FirstPersonArmsAnimator {
  let lastTick = -1;

  return {
    playInitial: () => {
      adapter.play("idle");
    },
    playEvent: (event) => {
      if (lastTick === event.tick) return;
      lastTick = event.tick;
      adapter.play(event.action);
    },
    update: (delta) => {
      adapter.update(delta);
    },
  };
}
