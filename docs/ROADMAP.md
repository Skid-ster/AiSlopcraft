# Roadmap / continuation checklist (branch `arena/433092f5-aislopcraft`)

A checked box means a *code milestone exists*, not that Java 1.7.3 parity is achieved. Preserve Git history; push only this branch and open a PR to main. Document test results, never invent a completion claim.

## A. Native foundation — code and headless tests
- [x] Replace previous browser Beta project (user explicitly authorised replacement), keep Git history, restore OFL font and add licensing.
- [x] C++20 CMake+SDL3 pinned source, registries, Java RNG, deterministic noise/biomes/trees, sections/lighting/raycast/fluids, player physics, inventory/recipes/furnace, CRC save/load.
- [x] Linux GCC 12.2 Debug app+tests compiled; CTest core/asset audit passed, binary `--selftest` passed; `--benchmark` CPU-only measured; attempted desktop launch failed due dummy SDL.
- [x] Original 460-tile atlas, hand-illustrated main categories, nine WAVs, font atlas, six animation strips; open and inspect art study; correct grass-side cap.
- [ ] More exhaustive regression: deterministic cross-chunk trees/biomes, fluids source removal, redstone tests after implementation, save fuzz/corruption/truncation, GLFW/GL visual smoke on a GPU machine. Add UI/menu interaction tests.
- [ ] Verify block/item IDs, drops, metadata, recipes/food/fuel from release-1.7.3-specific sources and actual client; no verified parity yet.

## B. Native desktop milestone — coded, GPU testing blocked here
- [x] OpenGL 3.3 shader/VBO renderer, face-culling and special-shape approximations, grass biome overlay, animated atlas, sky/fog, SDL3 input/audio code, first-person gameplay controls.
- [x] Coded GUI screens title/new seed, HUD/inventory/crafting/furnace/chest/pause/options/death, menu background, debug readout, F2 PNG.
- [x] Background chunk generation with one bounded worker, main-thread section upload budget, distance culling.
- [ ] Launch on actual GPU with desktop SDL3 backends, capture/screenshots of seven comparison scenes, inspect and fix shaders/UI/UV/camera/transparency. All runtime statements in README remain unverified until then.
- [ ] Persist all container/craft/UI states safely; fix fragile key-only controls and full world selection; map accurate item models and first-person hand, particles/clouds/weather.
- [ ] Profile stutter (relight/mesher) before optimising; then use measured budget/worker changes for i5-13400.

## C. Release-1.7.3 scope
- [ ] Complete registry/metadata/recipes/lighting/tick rules, fluids source receding, redstone, doors/pistons, chests and all interactions.
- [ ] 1.7-era worldgen rules and structures; Nether/End portals + bosses; villages/mineshafts/temples/dungeons/strongholds, dimensions and weather.
- [ ] Species-specific mobs/models/UVs/skins/animation/AI/spawning/drops/combat; armor/equipment/XP, enchanting/brewing/fishing, boats/minecarts.
- [ ] Protocol 4 multiplayer research, implementation/test before compatibility claims; optional safe local pack importer only after ZIP hardening.
- [ ] Original art replace **109** provisional rare icons, mob skins/models, menus, sky/clouds/particles and sounds; record reference comparison evidence.

## D. Release engineering
- [x] Add Windows+Linux GitHub Actions workflow with pinned action commits and SDL3 archive SHA, fail if fewer than three named tests, upload binary assets/logs.
- [ ] Run the clean-checkout Actions workflow and **inspect actual Windows/Linux results and downloadable artifacts**; no CI outcome should be claimed from file existence alone.
- [ ] Commit tested milestones on `arena/433092f5-aislopcraft`; push only this branch; open PR to `main`, report genuine links/check results. Do not merge/release without explicit authorization and successful checks.
- [ ] Provide repeatable GPU benchmark on real 2560×1440 target PC (7 scenes, frame-time/RAM/VRAM percentiles) and compare against same settings/screenshots. This sandbox cannot supply target-PC data.

Definition of Done remains unmet until full content, visual comparisons, tested GPU startup, clean builds, performance attribution and CI evidence exist.
