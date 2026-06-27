# Muma City Roadmap

Muma City is an experimental first-person 3D workspace for Hermes Agent workflows. This roadmap keeps the project focused on practical open-source milestones while the interface, scene design, and desktop safety model continue to evolve.

## v0.6.x: Experimental Preview

- Keep the existing Hermes Desktop workflows usable while Muma City-specific 3D work is added.
- Stabilize the Office3D scene, including player movement, camera behavior, interaction targets, and basic HUD state.
- Preserve upstream MIT license attribution and third-party asset records.
- Maintain basic validation commands: `npm run typecheck`, `npm test`, and `npm run build:unpack`.
- Document setup, release notes, and project scope clearly enough for new contributors to understand the direction.

## v0.7: Agent Workspace Foundations

- Make chat, task, memory, skill, and tool areas easier to discover from the 3D workspace.
- Improve the connection flow for local and remote Hermes Agent sessions.
- Add clearer boundaries between experimental scene assets and assets intended for release builds.
- Add more tests around workspace state mapping, tool metadata, and UI behaviors that affect agent workflows.
- Improve developer documentation for running the desktop app from a clean checkout.

## v0.8: Safer Desktop Agent Workflows

- Review local file access, credential handling, tool execution, and gateway integration surfaces.
- Add contributor-facing guidance for handling API keys, local data, and generated artifacts safely.
- Improve release packaging notes for Windows, macOS, and Linux.
- Expand automated checks for build stability and dependency regressions.
- Prepare a more polished preview release with screenshots and a clear changelog.

## Longer-Term Ideas

- A richer city map that connects rooms, agent workflows, and project artifacts.
- Visual debugging for agent plans, tool calls, memory updates, and task progress.
- Optional game-like routines for recurring developer workflows.
- Better onboarding for users who are new to local AI-agent tooling.
- Community templates for agent workspaces, rooms, tools, and scene layouts.