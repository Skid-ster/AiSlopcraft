# World core rebuild increment

**Goal:** Make new solo and online worlds use a deterministic 256-block Overworld without changing existing saves or admitting incompatible clients.

**Architecture:** A shared terrain identifier selects generation, runtime bounds, save version and room compatibility independently of Survival/Creative. Keep the existing browser renderer and relay; build on their current gameplay instead of introducing a second game or claiming inventory authority.

**Spec:** [Research and priorities](../../minecraft-1.7.10-research.md). Keep Classic/Beta saves and wire clients, existing touch controls, static Pages support, and process-local five-by-five rooms. No new dependencies, copied game assets or release operations.

- [x] Pin legacy terrain to pre-change block hashes; exercise height, lighting, remeshing, chunk-order determinism, and edit reload in `tests/world.test.mjs`. Implement per-profile chunk bounds and target-only Overworld generation in `src/world/`.
- [x] Round-trip legacy and 256-block saves in `tests/save.test.mjs`; reject mismatched/unknown formats. Update `src/save.js`, `src/save-manager.js` and launch/save paths in `src/main.js`, preserving save identity when re-creating a seed.
- [x] Test both room modes, old-client discovery/join isolation, edit bounds and late join snapshots in `tests/multiplayer.test.mjs`. Make the relay and browser agree on the terrain profile before joining or uploading edits; keep the legacy room contract.
- [x] Test Creative flight permission and collision in `tests/survival.test.mjs`, and browser catalog/flight with desktop and touch in `tests/e2e/game.spec.mjs`; hook both modes into the same world implementation.
- [x] Use voxel light for day/night Survival spawning so caves can remain dangerous and torches matter. Keep the multiplayer clock and shared simulation running while the host opens menus.
- [x] Run Node 22 `npm run verify`, including production/performance smoke and Chromium; document behavior, Windows skips, and remaining gameplay/authority limits. Passed with 19 Chromium tests and zero audit findings; the Windows symlink assertion was the only skip.
