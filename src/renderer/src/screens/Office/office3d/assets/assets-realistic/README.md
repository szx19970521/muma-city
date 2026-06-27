# Hermes One Visual Game Asset Candidates

This folder is a first-pass asset drop for replacing the current low-poly hands/props in the Aima Room 3D scene.

## Installed files

```text
assets-realistic/
  hands/
    first_person_hands.glb
    first_person_hands.fbx
    first_person_hands.blend
    first_person_hands_basecolor.png
    first_person_hands_gloves_basecolor.png
  characters/
  props/
    tablet.glb
    task_card.glb
    folder.glb
    communicator.glb
    toolbox.glb
    wrench.glb
```

## First-person hands

- File: `hands/first_person_hands.glb`
- Source: PSX First Person Arms by Drillimpact
- URL: https://drillimpact.itch.io/psx-first-person-arms-free
- License: CC0 / Public Domain
- Size: 1.1 MB
- GLB check: 1 mesh, 1 skin, 1 material, 1 embedded image
- Animation clips: `finger_gun_broken`, `finger_gun_fire`, `finger_gun_fix`, `finger_gun_idle`, `grab.L`, `grab.R`, `guard_draw`, `guard_idle`, `jab.L`, `jab.R`, `knife_draw`, `knife_hit_01`, `knife_hit_02`, `knife_idle`, `push.L`, `push.R`, `relax`, `rest`

Notes:

- This is the strongest immediate drop-in candidate because it is rigged, animated, GLB-ready, tiny, and CC0.
- It is PSX/low-poly hand-painted, not realistic PBR. Treat it as an interaction-quality upgrade, not the final realistic art direction.
- `relax` or `rest` can be mapped to idle. `push.L/R` can be mapped to click/use. `grab.L/R` can be mapped to grab.

## Props

All prop GLBs are independent files downloaded from Poly Pizza static GLB exports.

| File | Source | URL | License |
| --- | --- | --- | --- |
| `props/tablet.glb` | Tablet by Poly by Google | https://poly.pizza/m/2LxocCCiDy- | CC-BY 3.0 |
| `props/task_card.glb` | Pickup Key Card by Quaternius | https://poly.pizza/m/EDvCEBvs8k | CC0 1.0 |
| `props/folder.glb` | File Folder by Ryan Dewalt | https://poly.pizza/m/fDhOEadpKWA | CC-BY 3.0 |
| `props/communicator.glb` | Walkie talkie by Poly by Google | https://poly.pizza/m/2SK5EmWHAa0 | CC-BY 3.0 |
| `props/toolbox.glb` | Toolbox by jeremy | https://poly.pizza/m/20JcnkCnbAc | CC-BY 3.0 |
| `props/wrench.glb` | Wrench by CreativeTrio | https://poly.pizza/m/POJHQLnLvB | CC0 1.0 |

## Character model notes

I did not install a new character model in this pass. The free, direct-download sources that satisfy "realistic office worker + humanoid/Mixamo rig + idle/walk/sit/typing/talk/wave/point + GLB" are sparse. Practical next candidates:

- Mixamo: best animation source for idle/walk/sit/talk/wave/point, but downloads usually require an Adobe account and FBX-to-GLB conversion.
- Renderpeople free samples: good realism and real-world proportions, but often require account/manual download and may need retargeting.
- Ready Player Me: GLB avatars are convenient and style-consistent, but Mixamo animations usually need a Blender conversion/retargeting pass.
- Quaternius modular packs: CC0, GLTF/GLB-friendly, many animations, but visibly low-poly/stylized rather than realistic.
