# Feature matrix — Java Edition **release 1.7.3** target

Statuses: **NOT STARTED**, **IN PROGRESS**, **IMPLEMENTED**, **VERIFIED**, **BLOCKED**. *VERIFIED* must name a meaningful test or reference comparison and applies **only to the described local invariant**, not whole-game or vanilla parity. No claim of complete 1.7.3 accuracy follows from these tests.

| System | Status | Evidence / missing work |
|---|---|---|
| Target version identity | IMPLEMENTED | `RESEARCH.md` cites the December 2013 1.7.4 pre-release. No reference client comparison. |
| Block numeric IDs, metadata and drops | IN PROGRESS | `Blocks.*` table, 1.7 tile names, mining/drop logic; `voxcore_tests` checks representative IDs, tiers, variants/drops; not exhaustive, no Silk Touch/fortune. |
| Item IDs, tools, stack limits, armor, food | IN PROGRESS | `Items.*` partial definitions; `voxcore_tests` checks representative rules; many effects/enchantments missing. |
| Inventory transactions and recipes | IN PROGRESS | `Inventory.*` and explicit partial `Recipes.*`, 2×2/3×3 matching/mirroring, tested in CTest. Catalogue incomplete. |
| Smelting/fuels/furnace | IN PROGRESS | Core furnace ticks and GUI code; local CTest covers one ore and fish restriction; container state not saved. |
| Java 48-bit random | VERIFIED | `voxcore_tests` compares known Java Random(0) first two signed values, bound behavior and repeats. Does **not** imply vanilla terrain identity. |
| Deterministic seeded terrain/chunk boundaries | IN PROGRESS | `WorldGen.*` 1.7-inspired climate/biomes, caves, ores, trees, superflat/large/Amplified; negative coords and repeated fixed-seed chunk bytes checked in CTest. No seed-for-seed parity or structure generator. |
| Nether/End/portals/progression/bosses | IN PROGRESS | Basic dimension block terrain only; no portal navigation, dragon/wither or progression. |
| Lighting, night and weather | IN PROGRESS | Sky/block propagation and removal tested for a roof/torch in CTest; 3×3 relight may hitch; no weather. |
| Fluids, scheduled ticks, gravity, farming | IN PROGRESS | Basic local water/lava, falling blocks and crop updates; one water/one sand scenario tested. Source removal and many tick rules wrong/incomplete. |
| Redstone/pistons/mechanisms | NOT STARTED | Registry IDs exist, simulation and rendering largely absent. |
| Survival/creative movement, hunger/damage | IN PROGRESS | `Physics.*`: walk/sprint/sneak/jump/swim/fly, collision/step, hunger/health/fall/drowning. Headless flat-world physics/food/damage/respawn test; no reference timing comparison. |
| Combat, armor/equipment, XP, death drops | IN PROGRESS | Damage/armor point field, hunger/XP counters and respawn. No attackable mob entities, armor durability, dropped-item physics or actual XP system. |
| Fishing/brewing/enchanting/vehicles | NOT STARTED | Some registered items/blocks, no gameplay. |
| Passive/hostile mobs/models/AI/bosses | NOT STARTED | No native mobs or mob art. |
| GUI and input | IN PROGRESS | SDL3 title/new-seed/options/HUD/inventory/crafting code. Mouse down now refreshes the target and advances mining immediately; right click refreshes selection, can eat while aiming at sky, and explains placement failure. Focus loss cancels a held mine. [Linux SDL/Xvfb CI](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41351266541) passed `--interaction-smoke`, which injects clicks in a disposable GL world and asserts mine/place/hold/eat; **Windows physical-input retest pending**. |
| World/GUI rendering | IN PROGRESS | OpenGL 3.3 depth-writing alpha-cutout foliage, backface/view-cone culling, targeted block outline, gray bevelled original GUI, biome tint once rather than twice. Earlier user Windows screenshot showed visual defects; changed pixels await another Windows screenshot and actual reference-client comparison. Linux CI PNG files were not visually inspected. |
| Linux software-GL context and frame-file creation | VERIFIED | Ubuntu 24.04 CI job explicitly launched Xvfb/Mesa, `--visual-smoke` completed, checked three PNG signatures/dimensions (1280×720) and nontrivial sizes, then uploaded captures. **No pixel/aesthetic comparison**. |
| Asset lookup/decoding | VERIFIED | `vox_asset_audit` decodes atlas/font/6 strips, checks 20,816 lookup calls, 9 WAV headers and neutral tinted grass/leaves/tallgrass pixels plus leaf cutout density. **Only these local invariants**, not visual parity. |
| Original art/audio quality | IN PROGRESS | 460 tiles, 6 strips, 9 effects; `assets/previews/art-study.png` is a tinted QA preview, not a gameplay shot. 108 rare icons remain explicitly provisional; models/skins incomplete. |
| v1 save CRC/round trip | VERIFIED | `voxcore_tests` save/reload, negative coords, edit/player inventory, checksum failure, missing file and leftover interrupted `.tmp`. Only v1 subset, **not** complete world persistence. |
| Containers/entities/weather in saves | NOT STARTED | Required before persistence considered complete; see `SAVE_FORMAT.md`. |
| Multiplayer protocol 4 | NOT STARTED | No packet handling, server or compatibility tests. |
| GPU benchmark at native 1440p on target PC | BLOCKED | RTX 5060 Ti/i5-13400 not connected; CPU-only sandbox one-chunk measurements are separately labelled. |
| Current clean-checkout Windows+Linux CI | VERIFIED | [PR run 41351266541](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41351266541) (`b7cca84`) passed Windows 2022, VS 2026 and Ubuntu Release builds/headless tests; Ubuntu also passed Xvfb/Mesa graphical frame creation and synthetic SDL interaction smoke. User's earlier Windows screenshot proves prior graphical launch but not **after-fix Windows interaction/FPS or visual parity**. |

## Recorded local validation (Linux x86_64 sandbox, Xeon @ 2.60 GHz, 2 vCPU)

Historical local Debug/Release and core-only ASan+UBSan suites passed before this patch. Current `build/native` with pinned SDL3 console/dummy (no X11/OpenGL) compiled the changed app and passed **3/3 Release CTests**; current `build/core` passed **2/2**. `SDL_VIDEODRIVER=dummy ./build/native/aislopcraft --interaction-smoke` exited 1 as expected because this SDL build cannot open an OpenGL window; that is **not** an input-pass result. A single-run 25-chunk roofed-forest CPU geometry comparison is documented in `PERFORMANCE.md`; no GPU FPS. [Pre-fix PR CI](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41340651114) verified Windows 2022/VS 2026/Linux builds, headless tests and Linux screenshot *file creation*. [Current PR CI](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41351266541) verified the changed GL/SDL input smoke on Linux software OpenGL; the user's Windows machine still needs a gameplay/performance retest.
