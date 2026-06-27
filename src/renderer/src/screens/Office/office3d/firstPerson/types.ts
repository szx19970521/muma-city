export type HandAction =
  | "idle"
  | "walk"
  | "jump"
  | "click"
  | "reach_mid"
  | "reach_high"
  | "pickup_floor"
  | "grab_shelf"
  | "hold_one_hand"
  | "hold_two_hand"
  | "put_away"
  | "inspect"
  | "reach"
  | "grab"
  | "press"
  | "point"
  | "holdItem"
  | "putAway";

export type HeldItemKind = "none" | "book" | "taskCard" | "tablet" | "tool";
export type FirstPersonSocketName =
  | "leftPalm"
  | "rightPalm"
  | "leftGrip"
  | "rightGrip"
  | "leftWrist"
  | "rightWrist"
  | "heldItem"
  | "chest"
  | "cameraAnchor";

export interface HandActionEvent {
  tick: number;
  action: HandAction;
  heldItem: HeldItemKind;
}

export interface FirstPersonMotionState {
  moving: boolean;
  pitch: number;
  sprinting?: boolean;
  jumping?: boolean;
  verticalOffset?: number;
}

export type FirstPersonViewMode = "firstPerson" | "thirdPerson" | "driving";

export interface FirstPersonPlayerPose {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  moving: boolean;
  sprinting: boolean;
  jumping: boolean;
  verticalOffset: number;
  viewMode: FirstPersonViewMode;
}

export type FirstPersonInteractionKind =
  | "button"
  | "door"
  | "floor"
  | "generic"
  | "screen"
  | "shelf"
  | "tool"
  | "vehicle";

export interface FirstPersonInteractionProfile {
  kind?: FirstPersonInteractionKind;
  action?: HandAction;
  heldItem?: HeldItemKind;
  label?: string;
  hand?: "left" | "right" | "both";
}

export interface FirstPersonHudState {
  heldItem: HeldItemKind;
  inventoryOpen: boolean;
  statusOpen: boolean;
  motion: FirstPersonMotionState;
  lastAction: HandAction;
  focusedTarget?: string;
  interactionHint?: string;
  interactionHintMode?: "target" | "held" | "toast";
}

export interface FirstPersonStatusInfo {
  currentModel: string;
  currentProvider: string;
  gatewayOnline: boolean;
  agentCount: number;
}

export type RigFallbackMode =
  | "hidden-until-valid"
  | "dev-only-fallback"
  | "safe-placeholder-hands";

export interface FirstPersonTransformConfig {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number | [number, number, number];
}

export interface FirstPersonAssetAttribution {
  title: string;
  author: string;
  url: string;
  license:
    | "CC0"
    | "CC-BY"
    | "project-owned"
    | "free-commercial-use-no-attribution-required"
    | "unknown";
  downloadedAt?: string;
  notes?: string;
}

export interface FirstPersonRigConfig {
  activeRigUrl: string;
  assetFormat?: "glb" | "fbx";
  visualReviewStatus?: "passed" | "failed" | "pending";
  visualReviewNotes?: string;
  animationSources?: Array<{
    action: HandAction;
    url: string;
  }>;
  bodyUrl?: string;
  attribution: FirstPersonAssetAttribution;
  fallbackMode: RigFallbackMode;
  generatedOfficeActions?: boolean;
  rootTransform: FirstPersonTransformConfig;
  socketMap: Record<FirstPersonSocketName, string[]>;
  animationMap: Partial<Record<HandAction, string[]>>;
}
