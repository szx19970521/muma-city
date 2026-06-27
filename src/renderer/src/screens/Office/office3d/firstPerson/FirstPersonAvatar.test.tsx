import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstPersonAvatar } from "./FirstPersonAvatar";
import type { FirstPersonMotionState, HandActionEvent } from "./types";

vi.mock("./FirstPersonView", () => ({
  FirstPersonView: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="first-person-view">{children}</div>
  ),
}));

vi.mock("./RiggedArmsRenderer", () => ({
  RiggedArmsRenderer: () => <div data-testid="rigged-arms" />,
}));

vi.mock("./FallbackArmsRenderer", () => ({
  FallbackArmsRenderer: () => <div data-testid="fallback-arms" />,
}));

vi.mock("./HeldItemSystem", () => ({
  HeldItemSystem: () => <div data-testid="held-item-system" />,
}));

vi.mock("./FirstPersonBodyRenderer", () => ({
  FirstPersonBodyRenderer: () => <div data-testid="first-person-body" />,
}));

const action: HandActionEvent = {
  action: "idle",
  heldItem: "none",
  tick: 1,
};

const motion: FirstPersonMotionState = {
  moving: false,
  pitch: 0,
};

describe("FirstPersonAvatar", () => {
  it("keeps first-person hands hidden while preserving held-item rendering", () => {
    render(<FirstPersonAvatar action={action} motion={motion} />);

    expect(screen.queryByTestId("rigged-arms")).toBeNull();
    expect(screen.queryByTestId("fallback-arms")).toBeNull();
    expect(screen.queryByTestId("first-person-body")).toBeNull();
    expect(screen.getByTestId("held-item-system")).toBeInTheDocument();
  });
});
