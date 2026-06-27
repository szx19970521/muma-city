# Muma City / 牧马城市

Muma City is an experimental MIT-licensed desktop workspace for AI agents. It builds on [Hermes Desktop](https://github.com/fathah/hermes-desktop) and explores a first-person 3D interface where chat, tasks, memory, skills, tools, and gateway integrations become part of an explorable office and city environment.

The project is early, but actively maintained. The goal is to make local agent-based development easier to understand by turning agent workflows into visible places, objects, and routines instead of only panels and logs.

![Muma City office preview](./previews/office.png)

## Why This Exists

Most agent tools expose powerful capabilities through dense text UIs. Muma City experiments with a different shape:

- an office and city workspace for working with agents;
- visible rooms and boards for sessions, tasks, memories, skills, and tools;
- first-person and third-person navigation experiments;
- local and remote Hermes Agent connection workflows;
- desktop packaging, release, and security work for agent-powered software.

## Current Focus

- First-person and third-person 3D workspace navigation
- Visual task boards, memory views, skill maps, tool panels, and gateway screens
- Office, parking lot, restaurant, vehicle shop, park, and city-block scene experiments
- Player movement, HUD, inventory, character animation, and interaction prototypes
- Safer desktop handling for local files, credentials, agent tools, and user context

## Screenshots

| Office | Chat | Gateway |
| --- | --- | --- |
| ![Office](./previews/office.png) | ![Chat](./previews/chat.png) | ![Gateway](./previews/gateway.png) |

| Kanban | Memory | Skills |
| --- | --- | --- |
| ![Kanban](./previews/kanban.png) | ![Memory](./previews/memory.png) | ![Skills](./previews/skills.png) |

## Development

```bash
npm install
npm run dev
```

Common validation commands:

```bash
npm run typecheck
npm test
npm run build:unpack
```

## Project Status

Muma City is an experimental preview. Core workflows are still changing, and the 3D scene, movement, collisions, traffic, weather, and game-style UI are being iterated in small steps. Stability, attribution, and safe local-agent behavior take priority over shipping every visual idea at once.

See [docs/ROADMAP.md](./docs/ROADMAP.md) for the current development plan.

## Release Notes

The current preview is `v0.6.1`. See [docs/RELEASE_NOTES_v0.6.1.md](./docs/RELEASE_NOTES_v0.6.1.md) for the suggested GitHub release description.

## Open Source And Attribution

Muma City is a derivative work based on Hermes Desktop and keeps the upstream MIT License notice. Upstream project information and third-party 3D/animation asset notes are documented in:

- [LICENSE](./LICENSE)
- [NOTICE.md](./NOTICE.md)
- `src/renderer/src/screens/Office/office3d/assets/THIRD_PARTY_ATTRIBUTION.json`
- `src/renderer/src/screens/Office/office3d/assets/FIRST_PERSON_ATTRIBUTION.json`

Do not commit `.env` files, API keys, private keys, or local personal data. Experimental large assets and temporary downloads should stay in ignored directories such as `work/`.