/* eslint-disable @typescript-eslint/explicit-function-return-type */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rigConfigPath = path.join(
  root,
  "src/renderer/src/screens/Office/office3d/firstPerson/rigConfig.ts",
);
const attributionPath = path.join(
  root,
  "src/renderer/src/screens/Office/office3d/assets/FIRST_PERSON_ATTRIBUTION.json",
);
const activeRigRelativePath =
  "src/renderer/src/screens/Office/office3d/assets/first-person-arms/kuptchi/FBX_Files/FP_Arms.fbx";
const activeAttributionRelativePath =
  "first-person-arms/kuptchi/FBX_Files/FP_Arms.fbx";
const requiredAnimationFiles = [
  "src/renderer/src/screens/Office/office3d/assets/first-person-arms/kuptchi/FBX_Files/Animations/Rifle_01_Animations/Cycles/FP_Arms_Rifle_01_Breathing.fbx",
  "src/renderer/src/screens/Office/office3d/assets/first-person-arms/kuptchi/FBX_Files/Animations/Rifle_01_Animations/Cycles/FP_Arms_Rifle_01_Walk.fbx",
  "src/renderer/src/screens/Office/office3d/assets/first-person-arms/kuptchi/FBX_Files/Animations/Rifle_01_Animations/OneTimeAnimations/FP_Arms_Rifle_01_Interact.fbx",
  "src/renderer/src/screens/Office/office3d/assets/first-person-arms/kuptchi/FBX_Files/Animations/Rifle_01_Animations/Poses/FP_Arms_Rifle_01_BasePose.fbx",
  "src/renderer/src/screens/Office/office3d/assets/first-person-arms/kuptchi/FBX_Files/Animations/Rifle_01_Animations/TransitionAnimations/FP_Arms_Rifle_01_Hide.fbx",
];
const requiredRigConfigTokens = [
  "activeRigUrl: kuptchiArmsUrl",
  'assetFormat: "fbx"',
  'visualReviewStatus: "failed"',
  "generatedOfficeActions: false",
  'fallbackMode: "safe-placeholder-hands"',
  "animationSources:",
  'author: "Kuptchi"',
];
const requiredActions = [
  "idle",
  "walk",
  "jump",
  "click",
  "grab_shelf",
  "pickup_floor",
  "hold_one_hand",
  "hold_two_hand",
  "put_away",
  "inspect",
];
const forbiddenActiveTokens = [
  "drillimpactArmsUrl",
  "opengameart",
  "jToastie",
  "first_person_hands.glb",
  "opengameart_cc0_fps_arms_test.glb",
  "rigged-fps-arms.glb",
];

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function statRequiredFile(relativePath, minBytes) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { error: `Missing required file: ${relativePath}` };
  }
  const stat = fs.statSync(absolutePath);
  if (stat.size < minBytes) {
    return {
      error: `Required file is unexpectedly small: ${relativePath} (${stat.size} bytes)`,
    };
  }
  return { size: stat.size };
}

function countOccurrences(source, token) {
  return source.split(token).length - 1;
}

const errors = [];
const warnings = [];
const rigConfig = readText(rigConfigPath);

for (const token of requiredRigConfigTokens) {
  if (!rigConfig.includes(token)) {
    errors.push(`rigConfig.ts is missing required token: ${token}`);
  }
}

for (const token of forbiddenActiveTokens) {
  if (rigConfig.includes(token)) {
    errors.push(`rigConfig.ts still references retired first-person arm asset: ${token}`);
  }
}

for (const action of requiredActions) {
  if (!rigConfig.includes(`action: "${action}"`)) {
    errors.push(`rigConfig.ts is missing animation source for action: ${action}`);
  }
}

const mainRig = statRequiredFile(activeRigRelativePath, 100_000);
if (mainRig.error) errors.push(mainRig.error);

for (const animationFile of requiredAnimationFiles) {
  const result = statRequiredFile(animationFile, 100_000);
  if (result.error) errors.push(result.error);
}

const activeRigBytes = mainRig.size ?? 0;
const totalAnimationBytes = requiredAnimationFiles
  .map((animationFile) => statRequiredFile(animationFile, 100_000).size ?? 0)
  .reduce((sum, size) => sum + size, 0);

const socketCandidates = [
  "leftPalm",
  "rightPalm",
  "leftGrip",
  "rightGrip",
  "heldItem",
  "leftWrist",
  "rightWrist",
];
for (const socket of socketCandidates) {
  if (!rigConfig.includes(`${socket}: [`)) {
    errors.push(`rigConfig.ts is missing socket map entry: ${socket}`);
  }
}

if (countOccurrences(rigConfig, "kuptchiInteractUrl") < 4) {
  warnings.push("Kuptchi interact animation is reused heavily; inspect visual fit manually.");
}

const attribution = JSON.parse(readText(attributionPath));
const activeAssetAttribution = attribution.assets?.find(
  (asset) => asset.relativePath === activeAttributionRelativePath,
);
if (!activeAssetAttribution) {
  errors.push("Missing attribution entry for active Kuptchi first-person rig.");
} else {
  if (activeAssetAttribution.creator !== "Kuptchi") {
    errors.push("Active first-person rig attribution creator must be Kuptchi.");
  }
  if (activeAssetAttribution.requiresAttribution !== false) {
    errors.push("Kuptchi active rig should be recorded as no-attribution-required.");
  }
  if (!String(activeAssetAttribution.license).includes("free-commercial-use")) {
    errors.push("Kuptchi active rig license note must record commercial-use permission.");
  }
}

console.log("First-person rig validation");
console.log(`config: ${path.relative(root, rigConfigPath)}`);
console.log(`activeRig: ${activeRigRelativePath}`);
console.log(`activeRigBytes: ${activeRigBytes}`);
console.log(`animationFiles: ${requiredAnimationFiles.length}`);
console.log(`animationBytes: ${totalAnimationBytes}`);
console.log("animationSource: asset-clips");
console.log("visualReviewStatus: failed");
console.log("runtimeDisplay: safe-placeholder-hands");
for (const warning of warnings) console.log(`warning: ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

console.log("result: pass");
