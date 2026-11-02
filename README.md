# AiSlopcraft — independent native rebuild preview

An **unofficial, independently made** C++20 voxel-sandbox project inspired by the *era* of **Minecraft Java Edition release-numbered 1.7.3 (December 2013)**, the first pre-release of 1.7.4. **Not Beta 1.7.3.** AiSlopcraft is not affiliated with or endorsed by Mojang Studios or Microsoft. No Mojang source, JAR, textures, sounds or branding are distributed. Study art is original; SDL3 and stb use their documented licences.

> **Status: IN PROGRESS — limited technical preview, not the requested finished recreation.** The user rejected the older `aislopcraft` prototype's Windows appearance and responsiveness. Its code and Git history remain for rollback; it is **not** the new visual foundation. The independent `aislopcraft-rebuild` executable has one bounded, authored, persistent *creative study scene*. Neither its look nor physical Windows controls nor target-PC FPS have passed the [reference-led acceptance gates](docs/REBUILD_PLAN.md). [PR #17](https://github.com/Skid-ster/AiSlopcraft/pull/17) remains open. Please do not mistake green build/CI checks for 2013 visual parity.

## What the rebuild does

- Fixed 96×96×32 meadow/forest-edge scene, with a reachable stone outcrop under the first crosshair; no random seed, chunk streaming or real 2013 world generation. Independent simulation, DDA block targeting (4.5-block reach), AABB movement/collision, immediate break/place and chunk-edge remeshing; nine creative materials. Authored 16-pixel atlas, cutout foliage, per-corner voxel shade, soft sky/blocky-cloud experiment, hotbar and crosshair. These are **original provisional art**, not copies of the target game's assets.
- Narrow study saves (`saves-rebuild/study-v1.bin` **beside the executable**) preserve edited blocks, feet/camera and selected slot across restarts. F5 saves; autosave during active play and save-on-exit are enabled; validated `.bak` recovery and checksum/version rejection protect against common corruption. The format is separate from the legacy program's `saves/` and `options.txt`; [precise format, recovery and durability limits](docs/REBUILD_SAVE_FORMAT.md). The `--smoke` and `--selftest` modes do not read/write saves.
- **Not a complete game:** no survival, inventory/crafting, mobs, fluids, proper worldgen/biomes, day-night cycle, hand/item animation, title/options screen, audio, weather or multiplayer. Leaves, fog, sky, UI, block art and terrain still require a *matched* December 2013 client comparison; no convincing 1.7.3 likeness is claimed. The earlier executable has partial versions of other systems, but the user rejected its presentation.

The older executable is still named **`aislopcraft`** and is superseded for visual work. Use **`aislopcraft-rebuild`** for the new path. Status vocabulary: **NOT STARTED, IN PROGRESS, IMPLEMENTED, VERIFIED, BLOCKED**; VERIFIED always refers to a named narrow test or comparison, not feature completeness.

## Run it

### Windows (primary target)

**Prebuilt preview:** Download the Windows x64 ZIP from the [GitHub releases](https://github.com/Skid-ster/AiSlopcraft/releases) if available, **extract the whole ZIP** to a writable folder (not `Program Files`), then double-click `aislopcraft-rebuild.exe`. Keep its adjacent `assets/rebuild/atlas.png` and your `saves-rebuild/` folder when updating. Windows needs a working OpenGL 3.3 driver; a prebuilt executable does **not** need CMake or a Visual Studio install. Read `START_HERE.txt` in the ZIP. The prebuilt graphical Windows launch and physical mouse interaction remain **BLOCKED pending a user retest**.

**Compile source:** You need an installed Visual Studio/Build Tools **with MSVC C++ and a Windows SDK** (not specifically VS 2022), CMake ≥3.20, Ninja or NMake, and internet to fetch pinned SDL3 3.4.18 source. A Git checkout/source ZIP has `CMakeLists.txt` and `build-windows.cmd`; the binary ZIP does not. In **Command Prompt**, change to your source directory (adjust the example path):

```cmd
cd /d "C:\path\to\AiSlopcraft-src"
call build-windows.cmd
build\Release\aislopcraft-rebuild.exe
```

If this folder is already a Git checkout of the PR branch, run `git pull origin arena/433092f5-aislopcraft` before building. Do **not** run `git pull` in an extracted source ZIP. The helper discovers your installed MSVC toolchain via `vswhere`, builds both isolated executables and runs CTests/selftests; it does not require a particular VS-year generator. Do not start `build\Release\aislopcraft.exe` expecting the rebuild.

### Linux

For a Linux desktop with SDL3 video dependencies and an OpenGL 3.3 driver, extract the Linux x64 release archive if available and run `./aislopcraft-rebuild` from its extracted directory. An Ubuntu 24.04 build is **not** guaranteed to run on older distributions. To compile from source:

```bash
cmake -S . -B build/release -DCMAKE_BUILD_TYPE=Release
cmake --build build/release --parallel 4
ctest --test-dir build/release --output-on-failure
./build/release/aislopcraft-rebuild --selftest
./build/release/aislopcraft-rebuild
```

CMake fetches a pinned SDL3 if not installed. `-DVOXCRAFT_BUILD_APP=OFF` explicitly builds/tests the core without SDL/GL. The sandbox's local SDL dummy build **cannot** show GL, but Ubuntu CI uses Xvfb/Mesa software GL. No macOS support claim.

### Controls (creative only; physical Windows retest pending)

| Input | Action |
|---|---|
| WASD / mouse / Space / Ctrl | Walk / look / jump / sprint (AABB collision; one-block automatic step-up is absent) |
| Left / right click | Break targeted solid block / place selected block against its face within 4.5 blocks. The first click **after Esc** only recaptures the mouse; click again to interact. |
| 1–9 / wheel | Select a material in the original-art hotbar |
| Esc / click | Release mouse and pause / click to recapture |
| F2 / F3 / F5 / F7 | Screenshot to `screenshots/rebuild/` / FPS and CPU timings, target and edit count / save the separate study / cycle GUI scale |
| Close window | Save on exit (unless both saves are corrupt; read the onscreen/console error and [recovery policy](docs/REBUILD_SAVE_FORMAT.md)) |

The starter outcrop is already in reach. If you cannot mine: click the window to capture, point at the outlined solid face and left-click; F3 prints hit and diagnostics. Tell us if it still fails on your Windows build—synthetic SDL events cannot prove physical input.

## Validation and evidence

- **VERIFIED (narrow local tests):** GCC Release, full SDL dummy/no-GL build, **5/5 CTests**, including core save round-trip/backup/corruption/legacy-sentinel tests, controller, raycast, chunk seams and headless startup. These do **not** launch a graphical local desktop.
- **VERIFIED (narrow CI integration for the save/visual code):** [PR run 41371711967](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41371711967) built on Windows 2022 and VS 2026/CMD and Ubuntu with **5/5 CTests**. Ubuntu software GL captured two different 1280×720 frames and SDL-*synthetic* Escape/recapture/place/mine passed. I inspected the **actual** original-frame 256×144 CI thumbnail: the new image visibly has a near stone outcrop, trees and blocky cloud bands, but the flat terrain, crude textures/UI and absent held item still look unlike a finished 2013 client. A thumbnail is **not** a camera-matched comparison or full-resolution visual proof. A downloadable technical pre-release remains strictly limited to this slice.
- **BLOCKED:** No legal, camera-matched December 2013 reference-client side-by-side, physical Windows mouse test or i5-13400/RTX 5060 Ti 2560×1440 frame-time distribution exists. The [seven-scene review plan](docs/REBUILD_PLAN.md) and [known limitations](docs/KNOWN_LIMITATIONS.md) are binding, not proof of completion.

Git history retains the superseded prototype. Never delete existing `saves/`, `options.txt` or your separate `saves-rebuild/` folder to update the game.
