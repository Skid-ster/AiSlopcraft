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
| GUI and input | IN PROGRESS | SDL3 code for title/new seed/options/HUD/inventory, 48-slot paged creative catalogue, crafting/furnace/chest/death. `voxcore_tests` validates every catalogue stack; Linux CI generated GL title/world/creative captures, **but screenshots were not visually inspected here and no mouse/keyboard interaction was tested**. |
| World/GUI rendering | IN PROGRESS | OpenGL 3.3 shaders, VBO mesher, face cull, simple AO, tinted grass overlay, pixel sampling/fog, animated atlas strips. Linux software-GL CI captured title/world/creative PNGs; visual correctness, content and Windows/target-GPU output **unreviewed**. |
| Linux software-GL context and frame-file creation | VERIFIED | Ubuntu 24.04 CI job explicitly launched Xvfb/Mesa, `--visual-smoke` completed, checked three PNG signatures/dimensions (1280×720) and nontrivial sizes, then uploaded captures. **No pixel/aesthetic comparison**. |
| Asset lookup/decoding | VERIFIED | `vox_asset_audit` decodes atlas/font/6 strips, checks 20,816 lookup calls and 9 WAV headers; **only existence/loading**, not visual accuracy. |
| Original art/audio quality | IN PROGRESS | 460 tiles, 6 strips, 9 effects. `assets/previews/art-study.png` generated and visually inspected; 109 rare icons explicitly provisional, models/skins incomplete. |
| v1 save CRC/round trip | VERIFIED | `voxcore_tests` save/reload, negative coords, edit/player inventory, checksum failure, missing file and leftover interrupted `.tmp`. Only v1 subset, **not** complete world persistence. |
| Containers/entities/weather in saves | NOT STARTED | Required before persistence considered complete; see `SAVE_FORMAT.md`. |
| Multiplayer protocol 4 | NOT STARTED | No packet handling, server or compatibility tests. |
| GPU benchmark at native 1440p on target PC | BLOCKED | RTX 5060 Ti/i5-13400 not connected; CPU-only sandbox one-chunk measurements are separately labelled. |
| Clean-checkout Windows+Linux build/CTest CI | VERIFIED | [PR workflow run 41329077878](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41329077878) (code commit `2225a22`): both windows-2022 and ubuntu-24.04 Release jobs compiled app, discovered three named tests, passed 3/3, uploaded runnable bundles and logs; Ubuntu also passed software-GL frame-file smoke. **Windows graphical launch untested**. |

## Recorded local validation (Linux x86_64 sandbox, Xeon @ 2.60 GHz, 2 vCPU)

Local pinned FetchContent console/dummy SDL builds: `build/native-fetch` (Debug) and `build/release-local` (Release) each compiled and passed **3/3 CTest** with **34,941 core assertions** (including creative-catalogue validity), **20,816 tile lookups**, and binary headless smoke. `build/release-local/aislopcraft --selftest` also passed. Core-only GCC AddressSanitizer+UBSan `build/sanitized` passed **2/2** tests. The local `SDL_VIDEODRIVER=dummy ... --visual-smoke` exited 1 as expected (no OpenGL context in dummy driver). [GitHub Actions run](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41329077878) provides Windows/Linux Release build+CTest and Linux Xvfb/Mesa screenshot *file-creation* evidence, **not** inspected screenshots or target-PC FPS.
