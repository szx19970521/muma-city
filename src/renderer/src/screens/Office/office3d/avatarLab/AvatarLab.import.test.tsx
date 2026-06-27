/// <reference types="node" />

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

async function loadQuaterniusUal1Clip(clipName: string) {
  const file = path.resolve(
    "src/renderer/src/screens/Office/office3d/assets/quaternius/universal-animation-library/AnimationLibrary_Godot_Standard.glb",
  );
  const data = fs.readFileSync(file);
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const loader = new GLTFLoader();
  const gltf = await new Promise<Awaited<ReturnType<GLTFLoader["parseAsync"]>>>(
    (resolve, reject) => {
      loader.parse(buffer, `${path.dirname(file)}${path.sep}`, resolve, reject);
    },
  );
  return gltf.animations.find((clip) => clip.name === clipName);
}

function getTrackValueRange(track: { values: ArrayLike<number> }) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < track.values.length; index += 1) {
    const value = track.values[index] ?? 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return max - min;
}

describe("AvatarLab import smoke", () => {
  it("imports the isolated avatar lab without touching the main 3D scene", async () => {
    await expect(import("./AvatarLab")).resolves.toHaveProperty("default");
  });

  it("can resolve the installed Quaternius preview asset", async () => {
    const rigged = await import("../objects/RiggedCharacter");
    expect(rigged.QUATERNIUS_ANIMATION_LIBRARY_URL).toMatch(
      /AnimationLibrary_Godot_Standard\.glb/,
    );
    expect(rigged.QUATERNIUS_ANIMATION_LIBRARY_2_URL).toMatch(
      /UAL2_Standard\.glb/,
    );
  });

  it("exposes all installed free Quaternius raw animation clips in the lab", async () => {
    const lab = await import("./AvatarLab");
    expect(lab.QUATERNIUS_RAW_CLIP_NAMES).toHaveLength(46);
    expect(lab.QUATERNIUS_RAW_CLIP_NAMES).toContain("PickUp_Table");
    expect(lab.QUATERNIUS_RAW_CLIP_NAMES).toContain("Walk_Loop");
    expect(lab.QUATERNIUS_UAL2_RAW_CLIP_NAMES).toHaveLength(43);
    expect(lab.QUATERNIUS_UAL2_RAW_CLIP_NAMES).toContain("Walk_Carry_Loop");
    expect(lab.QUATERNIUS_UAL2_RAW_CLIP_NAMES).toContain(
      "Idle_TalkingPhone_Loop",
    );
    expect(lab.QUATERNIUS_FREE_ACTION_COUNT).toBe(89);
  });

  it("marks a small first-pass Quaternius core action set", async () => {
    const lab = await import("./AvatarLab");
    expect(lab.QUATERNIUS_CORE_ACTION_IDS.length).toBeGreaterThanOrEqual(10);
    expect(lab.QUATERNIUS_CORE_ACTION_IDS.length).toBeLessThanOrEqual(15);
    expect(lab.QUATERNIUS_CORE_ACTION_IDS).toContain("q1:PickUp_Table");
    expect(lab.QUATERNIUS_CORE_ACTION_IDS).toContain("q2:Walk_Carry_Loop");
  });

  it("registers installed Rocketbox actions for lab-only screening", async () => {
    const lab = await import("./AvatarLab");
    expect(lab.ROCKETBOX_INSTALLED_ACTION_IDS).toEqual([
      "rbx:idle-neutral",
      "rbx:walk-neutral",
      "rbx:sit-chair",
      "rbx:work-table",
      "rbx:gestic-talk",
      "rbx:try-door",
      "rbx:knock-door",
    ]);
  });

  it("exports role core sets plus recommendation and avoid tables", async () => {
    const lab = await import("./AvatarLab");
    expect(lab.AVATAR_LAB_ROLE_CORE_ACTION_IDS.player).toContain(
      "q1:Interact",
    );
    expect(lab.AVATAR_LAB_ROLE_CORE_ACTION_IDS.player).toContain(
      "q1:Sprint_Loop",
    );
    expect(lab.AVATAR_LAB_ROLE_CORE_ACTION_IDS.agent).toContain(
      "rbx:sit-chair",
    );
    expect(lab.AVATAR_LAB_ROLE_CORE_ACTION_IDS.agent).toContain(
      "mixamo:typing",
    );
    expect(lab.AVATAR_LAB_ROLE_CORE_ACTION_IDS.npc).toContain(
      "rbx:gestic-talk",
    );

    expect(lab.AVATAR_LAB_RECOMMENDED_ACTION_TABLE).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "player",
          actionId: "q1:Walk_Loop",
          source: "quaternius",
          status: "installed",
        }),
        expect.objectContaining({
          role: "agent",
          actionId: "mixamo:typing",
          status: "manual",
        }),
        expect.objectContaining({
          role: "npc",
          actionId: "rbx:knock-door",
          source: "rocketbox",
        }),
      ]),
    );

    expect(lab.AVATAR_LAB_AVOID_ACTION_TABLE).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "q1:Jog_Fwd_Loop-as-run" }),
        expect.objectContaining({ actionId: "q1:Pistol_*" }),
        expect.objectContaining({ actionId: "q2:Zombie_*" }),
        expect.objectContaining({ actionId: "unavailable:*" }),
      ]),
    );
  });

  it("marks Quaternius player idle/walk/run/jump/interact validation without hard-coding office gaps", async () => {
    const lab = await import("./AvatarLab");
    expect(lab.QUATERNIUS_PLAYER_ACTION_VERIFICATION_TABLE).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "q1:Idle_Loop",
          labStatus: "verified",
        }),
        expect.objectContaining({
          actionId: "q1:Walk_Loop",
          legMotionVerified: true,
        }),
        expect.objectContaining({
          actionId: "q1:Sprint_Loop",
          label: "跑步",
          legMotionVerified: true,
        }),
        expect.objectContaining({
          actionId: "q1:Jump_Start/q1:Jump_Loop/q1:Jump_Land",
          labStatus: "partial",
          connectDecision: "lab_only",
        }),
        expect.objectContaining({
          actionId: "q1:Interact",
          connectDecision: "ready_for_character_pipeline",
        }),
      ]),
    );

    const connectableIds = lab.AVATAR_LAB_CONNECTABLE_ACTION_TABLE.map(
      (row) => row.actionId,
    );
    expect(connectableIds).toEqual(
      expect.arrayContaining([
        "q1:Idle_Loop",
        "q1:Walk_Loop",
        "q1:Sprint_Loop",
        "q1:Interact",
      ]),
    );
    expect(connectableIds).not.toContain(
      "q1:Jump_Start/q1:Jump_Loop/q1:Jump_Land",
    );

    expect(lab.AVATAR_LAB_ACTION_GAPS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "quaternius:office-keyboard-mouse",
        }),
      ]),
    );
  });

  it("exports audition stage chains as multi-step scene actions", async () => {
    const lab = await import("./AvatarLab");
    const chainIds = lab.AVATAR_LAB_AUDITION_CHAINS.map((chain) => chain.id);

    expect(chainIds).toEqual([
      "player-walk",
      "player-run",
      "player-jump",
      "player-click-computer",
      "player-pickup-folder",
      "player-talk",
      "agent-work",
      "agent-talk",
      "agent-open-door",
      "agent-research",
    ]);
    expect(
      lab.AVATAR_LAB_AUDITION_CHAINS.every(
        (chain) => chain.steps.length >= 3,
      ),
    ).toBe(true);
    expect(lab.getAuditionChainStepLabels("player-run")).toEqual([
      "起跑准备",
      "冲向门口",
      "减速停下",
      "站定",
    ]);

    const run = lab.AVATAR_LAB_AUDITION_CHAINS.find(
      (chain) => chain.id === "player-run",
    );
    expect(run?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerClip: "Sprint_Loop" }),
      ]),
    );

    const agentDoor = lab.AVATAR_LAB_AUDITION_CHAINS.find(
      (chain) => chain.id === "agent-open-door",
    );
    expect(agentDoor?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentClip: "try_door" }),
      ]),
    );
  });

  it("separates audition chains into connectable candidates and lab-only chains", async () => {
    const lab = await import("./AvatarLab");
    const connectableIds = lab.AVATAR_LAB_AUDITION_CONNECTABLE_CHAINS.map(
      (chain) => chain.id,
    );
    const notRecommendedIds =
      lab.AVATAR_LAB_AUDITION_NOT_RECOMMENDED_CHAINS.map(
        (chain) => chain.id,
      );

    expect(connectableIds).toEqual(
      expect.arrayContaining([
        "player-walk",
        "player-run",
        "player-click-computer",
        "player-pickup-folder",
        "player-talk",
        "agent-talk",
      ]),
    );
    expect(notRecommendedIds).toEqual(
      expect.arrayContaining([
        "player-jump",
        "agent-work",
        "agent-open-door",
        "agent-research",
      ]),
    );
    expect(connectableIds).not.toContain("agent-open-door");
  });

  it("builds manual audition chains only for installed role-compatible actions", async () => {
    const lab = await import("./AvatarLab");

    const playerChain = lab.createManualAuditionChain(
      {
        id: "q2:Idle_FoldArms_Loop",
        state: "standing",
        label: "抱臂等待",
        note: "test",
        purpose: "人工筛选玩家待机。",
        category: "npc",
        recommendation: "core",
        quaterniusClip: "Idle_FoldArms_Loop",
        clipName: "Idle_FoldArms_Loop",
        library: "ual2",
        source: "quaternius",
        assetStatus: "installed",
      },
      "player",
    );

    expect(playerChain).toEqual(
      expect.objectContaining({
        id: "manual-player:q2:Idle_FoldArms_Loop",
        playerLibrary: "ual2",
      }),
    );
    expect(playerChain?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerClip: "Idle_FoldArms_Loop" }),
      ]),
    );

    expect(
      lab.getManualAuditionAvailability(
        {
          id: "mixamo:typing",
          state: "working_at_desk",
          label: "坐姿打字",
          note: "test",
          purpose: "未安装候选。",
          category: "agent",
          recommendation: "core",
          source: "mixamo",
          assetStatus: "manual",
        },
        "player",
      ).canAudition,
    ).toBe(false);
  });

  it("exports a unified action list and turns selected actions into an audition queue", async () => {
    const lab = await import("./AvatarLab");
    const allActions = lab.getAllAvatarLabActions();
    const walk = allActions.find((action) => action.id === "q1:Walk_Loop");
    const foldArms = allActions.find(
      (action) => action.id === "q2:Idle_FoldArms_Loop",
    );
    const talk = allActions.find((action) => action.id === "rbx:gestic-talk");
    const unavailable = allActions.find((action) => action.source === "mixamo");

    expect(walk).toBeTruthy();
    expect(foldArms).toBeTruthy();
    expect(talk).toBeTruthy();
    expect(unavailable).toBeTruthy();

    const chain = lab.createQueueAuditionChain(
      [walk!, foldArms!, unavailable!],
      [talk!],
    );
    expect(chain.id).toBe("manual-queue");
    expect(chain.steps.map((step) => step.label)).toEqual(
      expect.arrayContaining([
        "玩家 1: 移动",
        "玩家 2: 抱臂等待",
        "智能体 1: 手势交谈",
      ]),
    );
    expect(chain.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerClip: "Idle_FoldArms_Loop",
          playerLibrary: "ual2",
        }),
        expect.objectContaining({ agentClip: "gestic_talk" }),
      ]),
    );
    expect(chain.steps.some((step) => step.label.includes("Mixamo"))).toBe(false);
  });

  it("creates focused non-looping previews for a clicked player or agent action", async () => {
    const lab = await import("./AvatarLab");
    const allActions = lab.getAllAvatarLabActions();
    const sprint = allActions.find((action) => action.id === "q1:Sprint_Loop");
    const agentTalk = allActions.find(
      (action) => action.id === "rbx:gestic-talk",
    );

    const playerChain = lab.createFocusedAuditionChain("player", sprint!, 3);
    expect(playerChain).toEqual(
      expect.objectContaining({
        id: "focused-player:q1:Sprint_Loop:3",
        loop: false,
      }),
    );
    expect(playerChain.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerClip: "Sprint_Loop" }),
      ]),
    );

    const agentChain = lab.createFocusedAuditionChain("agent", agentTalk!, 4);
    expect(agentChain).toEqual(
      expect.objectContaining({
        id: "focused-agent:rbx:gestic-talk:4",
        loop: false,
      }),
    );
    expect(agentChain.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentClip: "gestic_talk" }),
      ]),
    );
  });

  it("keeps audition actors outside lab collision proxy boxes", async () => {
    const lab = await import("./AvatarLab");

    const deskCenter = lab.resolveAuditionCollision([0.18, 0, -0.34]);
    expect(deskCenter.hitLabels).toContain("办公桌");
    expect(deskCenter.position).not.toEqual([0.18, 0, -0.34]);

    const pair = lab.resolveAuditionActorCollision(
      [0, 0, 0],
      [0.05, 0, 0],
    );
    expect(pair.collided).toBe(true);
    expect(pair.playerPosition[0]).toBeLessThan(0);
    expect(pair.agentPosition[0]).toBeGreaterThan(0.05);
  });

  it("verifies Quaternius run has animated leg bones instead of a flat translation", async () => {
    const sprint = await loadQuaterniusUal1Clip("Sprint_Loop");
    expect(sprint).toBeTruthy();
    const legQuaternionTracks =
      sprint?.tracks.filter(
        (track) =>
          /\.(quaternion)$/.test(track.name) &&
          /thigh|shin|foot|toe/i.test(track.name),
      ) ?? [];
    expect(legQuaternionTracks.length).toBeGreaterThanOrEqual(8);
    expect(
      legQuaternionTracks.some((track) => getTrackValueRange(track) > 1),
    ).toBe(true);
  });

  it("indexes external action candidates by source and usage without installing them", async () => {
    const pool = await import("./actionAssetPool");
    expect(pool.ACTION_SOURCE_ORDER).toEqual([
      "all",
      "quaternius",
      "cmu",
      "rokoko",
      "mixamo",
      "unavailable",
    ]);
    expect(pool.ACTION_USAGE_ORDER).toContain("office");
    expect(pool.ACTION_USAGE_ORDER).toContain("restaurant");

    const ids = pool.EXTERNAL_ACTION_ASSET_CANDIDATES.map((entry) => entry.id);
    expect(ids).toContain("cmu:typing-laptop");
    expect(ids).toContain("rokoko:serve-counter");
    expect(ids).toContain("mixamo:typing");
    expect(ids).toContain("unavailable:bandai-namco");

    const cmuOffice = pool.filterActionAssetCandidates("cmu", "office");
    expect(cmuOffice.length).toBeGreaterThan(0);
    expect(cmuOffice.every((entry) => entry.source === "cmu")).toBe(true);
    expect(cmuOffice.every((entry) => entry.usageTags.includes("office"))).toBe(
      true,
    );

    const blocked = pool.filterActionAssetCandidates("unavailable", "all");
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((entry) => entry.status === "blocked")).toBe(true);
  });
});
