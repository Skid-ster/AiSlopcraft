# Archived roadmap — superseded native prototype

> **Do not use this checklist as the active plan.** After retesting on Windows, the user rejected the earlier build's appearance/completeness. Its implementation/history/saves remain for rollback. The active, gated restart roadmap is [REBUILD_PLAN.md](REBUILD_PLAN.md); the independent study is `aislopcraft-rebuild`. Old checkboxes do not transfer to it.

A checked box means a *code milestone exists*, not that Java 1.7.3 parity is achieved. Preserve Git history; push only this branch and open a PR to main. Document test results, never invent a completion claim.

## A. Native foundation — code and headless tests
- [x] Replace previous browser Beta project (user explicitly authorised replacement), keep Git history, restore OFL font and add licensing.
- [x] C++20 CMake+SDL3 pinned source, registries, Java RNG, deterministic noise/biomes/trees, sections/lighting/raycast/fluids, player physics, inventory/recipes/furnace, CRC save/load.
- [x] Linux GCC 12.2 Debug and Release app+tests compiled with pinned SDL3; **3/3 CTest**, binary `--selftest`, core-only ASan+UBSan **2/2**; `--benchmark` CPU-only measured; local desktop launch failed due dummy SDL.
- [x] Original 460-tile atlas, hand-illustrated main categories, nine WAVs, font atlas, six animation strips; open and inspect art study; correct grass-side cap.
- [ ] More exhaustive regression: deterministic cross-chunk trees/biomes, fluids source removal, redstone tests after implementation, save fuzz/corruption/truncation, GLFW/GL visual smoke on a GPU machine. Add UI/menu interaction tests.
- [ ] Verify block/item IDs, drops, metadata, recipes/food/fuel from release-1.7.3-specific sources and actual client; no verified parity yet.

## B. Native desktop milestone — coded, GPU testing blocked here
- [x] OpenGL 3.3 shader/VBO renderer, face-culling and special-shape approximations, grass biome overlay, animated atlas, sky/fog, SDL3 input/audio code, first-person gameplay controls.
- [x] Coded GUI screens title/new seed, HUD/inventory/48-slot paged creative catalogue/crafting/furnace/chest/pause/options/death, menu background, debug readout, F2 PNG.
- [x] Background chunk generation with one bounded worker, main-thread section upload budget, distance culling.
- [x] Launch three noninteractive test frames in Ubuntu CI under Mesa/Xvfb software-GL (title, world and creative); PNG files validated by header/size and uploaded. **Not** a visually reviewed screenshot or target-GPU performance test.
- [ ] Open/download the CI screenshots on a permitted host and inspect actual pixels; launch on a real GPU desktop, capture seven *matched-reference* scenes, inspect/fix shaders/UI/UV/camera/transparency and test real controls/audio. This sandbox cannot access the GitHub artifact blob host.
- [ ] Persist all container/craft/UI states safely; fix fragile key-only controls and full world selection; map accurate item models and first-person hand, particles/clouds/weather.
- [ ] Profile stutter (relight/mesher) before optimising; then use measured budget/worker changes for i5-13400.

## C. Release-1.7.3 scope
- [ ] Complete registry/metadata/recipes/lighting/tick rules, fluids source receding, redstone, doors/pistons, chests and all interactions.
- [ ] 1.7-era worldgen rules and structures; Nether/End portals + bosses; villages/mineshafts/temples/dungeons/strongholds, dimensions and weather.
- [ ] Species-specific mobs/models/UVs/skins/animation/AI/spawning/drops/combat; armor/equipment/XP, enchanting/brewing/fishing, boats/minecarts.
- [ ] Protocol 4 multiplayer research, implementation/test before compatibility claims; optional safe local pack importer only after ZIP hardening.
- [ ] Original art replace **109** provisional rare icons, mob skins/models, menus, sky/clouds/particles and sounds; record reference comparison evidence.

## D. Release engineering
- [x] Add Windows+Linux GitHub Actions with pinned action commits/SDL3 SHA; require all three named tests; upload binary assets/logs; Linux Mesa/Xvfb software-GL title/world/creative frame-file smoke.
- [x] [PR run 41329077878](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41329077878): inspected both clean-checkout job step statuses (**SUCCESS** Windows and Linux, each 3/3 CTest; Linux software-GL step **SUCCESS**) and artifact listings (Windows/Linux bundles, logs, Linux GL PNGs). Artifact **contents and screenshot pixels could not be downloaded/inspected** from this sandbox, so no visual-quality claim.
- [x] Commit on `arena/433092f5-aislopcraft`, push only this branch and open [PR #17 to main](https://github.com/Skid-ster/AiSlopcraft/pull/17). Do not merge/release without explicit authorization and a completed feature/visual/performance review.
- [ ] Provide repeatable GPU benchmark on real 2560×1440 target PC (7 scenes, frame-time/RAM/VRAM percentiles) and compare against same settings/screenshots. This sandbox cannot supply target-PC data.

Definition of Done remains unmet: clean CI builds exist, but full gameplay/content, visually inspected comparisons, real-GPU startup/interaction, full saving and target-PC profiling do **not**.
