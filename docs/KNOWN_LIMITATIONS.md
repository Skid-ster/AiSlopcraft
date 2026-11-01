# Known limitations — native milestone, not a complete recreation

## Directly observed blockers

- **Graphical launch:** Local x86_64 sandbox lacks X11/Wayland/OpenGL development/runtime drivers. SDL3 was compiled with `SDL_UNIX_CONSOLE_BUILD=ON`, dummy/offscreen video/audio and `SDL_OPENGL=OFF`. `SDL_VIDEODRIVER=dummy build/native/aislopcraft` exited **1** with `Cannot create OpenGL window: OpenGL support is either not configured in SDL or not available in current SDL video driver (dummy) or platform`. `--selftest`, CTest and CPU benchmark ran successfully, but **no actual GL scene/GUI/input/audio interaction or FPS was verified**. Windows primary build needs independent CI/hardware test.
- **Performance:** RTX 5060 Ti/i5-13400/16 GB PC is unavailable; one-chunk CPU milliseconds on a two-vCPU sandbox do not demonstrate 60/144 FPS at 2560×1440. No frame-time distribution or VRAM number exists.

## Gameplay/content

- **Not the entire game.** No mobs/models/AI/animation, first-person hands, physical item drops, XP economy, bosses/progression, portals, weather, redstone circuit solver/pistons, vehicles, fishing, brewing, enchanting, full farming/mob farms or protocol-4 multiplayer. Nether/End are *terrain-only* code paths with no travel UI/portal mechanics. No 1.7.3 server compatibility.
- Terrain, biomes, trees, ore, caves and structures are 1.7-**inspired**, *not* Java seed compatible. No villages/dungeons/mineshafts/strongholds/temples; biomes approximated. Chunk edges are deterministic by global coordinates; no exhaustive seam/structure comparison.
- Fluid flow is simplistic: source removal does not fully retract existing flow, mixing and flowing-level rules are incomplete; simulation avoids loading chunks from fluid propagation. Gravity blocks fall instantly rather than as entities. Scheduled updates and farmland/crop rules are limited. Relighting 3×3 chunks after edits is correct for tested local additions/removals but may hitch and miss long-range updates at the region boundary.
- Stair collisions use a conservative merged AABB; fences/panes/doors/bed/ladders are simplified. Many blocks with registry entries lack interactive gameplay. `blockDrop` returns a **single** stack, so multi-drop plants cannot be modeled correctly. No Silk Touch, Fortune, enchantments or potion effects; food effect/status mechanics absent. Tool/food/fuel tables need version-reference comparison; gold tool break speed is adjusted in gameplay but API is approximate.
- Crafting uses a partial recipe catalogue; different plank/wool variant matching, some results and fuel values need in-client verification. Furnace/chest contents are **not saved**. 2D inventory icons for block items are faces, not rotating 3D models. Multiple settings/controls lack the full original options system; key remapping not available.
- v1 saves (`SAVE_FORMAT.md`) persist seed, edits, time, player coords/health/hunger/36 slots but not chests, furnaces, entities, weather, scheduled ticks, second dimension, craft cursor/grid, armor inventory, XP level details, flight state or sound settings. CRC32+temp/rename are not full power-loss durability (no fsync/backup). The native binary save is **not** Anvil/NBT.
- New worlds use unique paths; loading uses the *last saved path* from `options.txt` rather than a multi-world list. If inventory/crafting is open during a crash, in-flight cursor/grid items can be lost.

## Art/visuals

- Atlas has 460 mapped tile names but **109 provisional emblem icons**, not finished artwork. No mob skins, models, held item/hand, full GUI sprite sheets, clouds, stars, moon/sun, rain, snow or particles. GUI and world shaders compile but cannot be visually validated in this sandbox. Grass overlay, ambient occlusion and tint colours are approximate; water/transparent ordering uses chunk-distance sorting rather than per-face order; no mipmaps, so distant shimmer is possible. Title scene has a static camera, not the release panorama. No screenshot comparison against an actual 1.7.3 client. The generated art study is an atlas preview, not proof of game-screen fidelity.

All assets are original except licensed OFL font; SDL3 (zlib) and stb (public domain/MIT) licensing is documented. No Mojang proprietary content is redistributed. Do not remove a limitation until specific tests/reference comparisons exist.
