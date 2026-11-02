# Rebuild Technical Preview 0.2.0 — limited creative study

**PRE-RELEASE / IN PROGRESS. Not the completed Minecraft Java release-numbered 1.7.3 recreation.** This is an independent, unofficial original-art voxel sandbox experiment targeting the *December 2013 release-numbered era*, **not Beta 1.7.3**. No Mojang/Microsoft assets, game code or branding are bundled. This release does **not** replace the older `v1.0.0` Beta-titled release, does not establish target-version visual parity and is not a recommendation to delete existing saves.

### Downloads

- **Windows x64:** `rebuild-preview-Windows-x64.zip`. Extract the *entire* ZIP to a writable folder, then start `aislopcraft-rebuild.exe`. No Visual Studio or CMake needed for the prebuilt executable; a working OpenGL 3.3 driver is required. Physical Windows control and frame-rate retesting remain outstanding.
- **Linux x64:** `rebuild-preview-Linux-x64.tar.gz`. Extract and run `./aislopcraft-rebuild` on a desktop with OpenGL 3.3 and SDL/X11/Wayland system dependencies. Built/tested on Ubuntu 24.04 CI; other distributions (especially older glibc) are not guaranteed.
- `SHA256SUMS.txt` lists both archive hashes. The ZIP/tar include only the new rebuilt executable, original 16-pixel study atlas, project/SDL3/stb licences and guide/docs; **not** the rejected old executable. Read `START_HERE.txt` before playing.

### Available in this technical slice

A fixed 96×96×32 daylight meadow/forest-edge study, nine original-material creative hotbar slots, WASD/mouse/jump/sprint, a 4.5-block crosshair target, left-click break/right-click place, chunk mesh updates, a provisional pixel-art HUD, voxel corner shading and a provisional sky/cloud treatment. The initial stone outcrop is deliberately under the crosshair and inside interaction reach. Esc releases the mouse; the *first* click after Esc recaptures it, and a subsequent click interacts.

**Separate study persistence:** F5, roughly 60 seconds of active play and closing the window save block deltas/camera/selected slot into `saves-rebuild/study-v1.bin` *beside the executable*. Valid previous saves are backed up to `.bak`; checksums/version/camera are validated on load. If both copies are bad, the game will **not silently autosave over them**; F5 explicitly chooses to write a fresh scene. Neither the old binary's `saves/`/`options.txt` nor Minecraft Anvil/NBT are read or migrated. See `docs/REBUILD_SAVE_FORMAT.md` for the exact format and crash/durability limits.

### Evidence and remaining blockers

- **VERIFIED (narrow CI only):** This release is created only after the same-commit Windows 2022 and VS 2026/CMD builds and Ubuntu Release builds pass the five named CTests; Ubuntu software OpenGL under Xvfb captures before/after rendered PNGs and exercises *SDL-synthetic* Escape/recapture/place/mine through the real event dispatcher. Unit tests include save round-trip, backup corruption and legacy-saves non-interference. Read the associated commit's GitHub Actions checks for exact outcomes.
- **IN PROGRESS / BLOCKED:** One authored, finite creative scene is **not** full world generation, survival, crafting, inventory, sound, mobs, weather or multiplayer. The target game's appearance is **not VERIFIED**: the author reviewed a small original-frame CI thumbnail and addressed obvious empty composition, but has no camera-matched, lawfully captured 2013 client comparison. The user's real Windows mouse response, graphics/lag and 2560×1440 frame-time percentiles still need retesting. CI success is not user acceptance.

If you try it, please report your Windows version/GPU driver, whether left/right clicks actually edit the outlined starter outcrop, your F3 FPS/frame/mesh timings, and a screenshot. Keep `saves-rebuild/` when updating. [Plan and required visual review](https://github.com/Skid-ster/AiSlopcraft/blob/arena/433092f5-aislopcraft/docs/REBUILD_PLAN.md) · [Known limitations](https://github.com/Skid-ster/AiSlopcraft/blob/arena/433092f5-aislopcraft/docs/KNOWN_LIMITATIONS.md) · [Open rebuild PR #17](https://github.com/Skid-ster/AiSlopcraft/pull/17).
