# Free Boss First-Person Arms Kit

This folder contains the best free/legally downloadable first pass I could assemble for a "boss first-person" view.

```text
assets-boss/
  hands/
    free_rigged_fps_arms_poly_pizza.glb
  watch/
    free_watch_poly_pizza.glb
  overlay/
    free_boss_suit_sleeves_watch_overlay.glb
```

## Downloaded assets

### `hands/free_rigged_fps_arms_poly_pizza.glb`

- Source: Rigged Fps Arms by J-Toastie
- URL: https://poly.pizza/m/XdHWM8uSAO
- License: CC-BY 3.0
- File size: 263 KB
- GLB check: 1 mesh, 33 nodes, 1 skin, 3 materials
- Animations: none

### `watch/free_watch_poly_pizza.glb`

- Source: Watch by Poly by Google
- URL: https://poly.pizza/m/5MFJqeBgWBn
- License: CC-BY 3.0
- File size: 178 KB
- GLB check: 8 meshes, 8 nodes, 1 embedded image

## Generated asset

### `overlay/free_boss_suit_sleeves_watch_overlay.glb`

- Source: generated locally from simple Three.js geometry.
- License: project-owned/generated; no external geometry.
- File size: 95 KB
- Contents: dark navy suit sleeves, white shirt cuffs, gold cufflinks, metal wristwatch with black dial and no brand logo.
- GLB check: 23 meshes, 26 nodes, 6 materials.

## Important caveats

- This is a free prototype kit, not a final AAA hand model.
- The free rigged arms have a skeleton but no built-in animation clips.
- The suit sleeves/watch overlay is not skinned to the arm rig yet; it should be positioned or parented to wrist/forearm nodes in code.
- For a polished boss view, the best production path is still a dedicated first-person coat/suit arms asset, or a custom Blender pass.

## Suggested office action set

Use procedural animation or custom clips:

- `idle_business`: relaxed low hands, subtle breathing.
- `walk_business`: restrained hand sway.
- `click_use`: small right index tap.
- `grab_card`: pinch gesture.
- `hold_tablet`: both hands hold a tablet.
- `point`: restrained executive pointing.
- `check_watch`: rotate left wrist upward.
- `present_open_hand`: palm-up reveal gesture.

