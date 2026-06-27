import { describe, expect, it } from "vitest";
import {
  profileToOfficeAgent,
  profilesToOfficeAgents,
} from "./agents";

describe("office profile agents", () => {
  it("maps only real profiles to office agents", () => {
    const agents = profilesToOfficeAgents([
      { name: "default", model: "gpt-test", provider: "openai" },
      { name: "planner", model: "gpt-test", provider: "openai" },
    ]);

    expect(agents).toHaveLength(2);
    expect(agents.map((agent) => agent.id)).toEqual(["default", "planner"]);
    expect(agents.some((agent) => "sceneOnly" in agent)).toBe(false);
  });

  it("keeps generated avatar profiles stable and distinct by profile name", () => {
    const planner = profileToOfficeAgent({ name: "planner" });
    const researcher = profileToOfficeAgent({ name: "researcher" });
    const plannerAgain = profileToOfficeAgent({ name: "planner" });

    expect(planner.avatarProfile).toEqual(plannerAgain.avatarProfile);
    expect(planner.avatarProfile).not.toEqual(researcher.avatarProfile);
  });
});
