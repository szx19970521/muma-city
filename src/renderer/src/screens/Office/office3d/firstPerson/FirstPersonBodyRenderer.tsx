import type { FirstPersonMotionState } from "./types";

export function FirstPersonBodyRenderer({
  motion: _motion,
}: {
  motion: FirstPersonMotionState;
}): React.JSX.Element | null {
  // Body rendering intentionally stays disabled until a real torso/legs asset is
  // available. The previous box/cone body was a prototype and is not acceptable
  // for the main first-person view.
  return null;
}
