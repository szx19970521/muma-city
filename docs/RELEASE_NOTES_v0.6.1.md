# Muma City v0.6.1 Experimental Preview

This is an early experimental preview of Muma City, an MIT-licensed first-person 3D workspace for Hermes Agent workflows.

## Highlights

- Builds on Hermes Desktop while introducing the Muma City workspace direction.
- Adds a game-like Office3D experience for exploring agent work through rooms, boards, tools, and visual workspace areas.
- Includes preview screens for chat, kanban, memory, skills, gateway, models, providers, settings, and office views.
- Keeps upstream Hermes Desktop license attribution and documents third-party 3D and animation asset references.
- Provides validation commands for type checking, tests, and unpacked desktop builds.

## Project Scope

Muma City is still experimental. The 3D scene, first-person movement, interaction model, HUD, traffic, weather, and game-style UI are under active development. This release is best treated as a source preview for contributors and early testers rather than a polished production desktop build.

## Validation

Recommended local checks:

```bash
npm install
npm run typecheck
npm test
npm run build:unpack
```

## Notes For Contributors

- Do not commit `.env` files, API keys, private keys, or local personal data.
- Keep third-party asset attribution updated when adding or replacing 3D models, animations, textures, or audio.
- Prefer small, reviewable changes that improve workspace stability, agent workflow clarity, and desktop safety.