import { HeldItemSystem } from "./HeldItemSystem";
import { FirstPersonView } from "./FirstPersonView";
import type { FirstPersonMotionState, HandActionEvent } from "./types";

export function FirstPersonAvatar({
  action,
  motion,
}: {
  action: HandActionEvent;
  motion: FirstPersonMotionState;
}): React.JSX.Element {
  return (
    <FirstPersonView motion={motion}>
      <HeldItemSystem
        item={action.heldItem}
        action={action.action}
        tick={action.tick}
      />
    </FirstPersonView>
  );
}
