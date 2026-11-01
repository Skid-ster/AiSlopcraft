# AiSlopcraft — native C++ voxel sandbox (early milestone)

An **unofficial, independently implemented** C++20 voxel-sandbox project targeting the *gameplay era* of **Minecraft Java Edition release 1.7.3**, the December 2013 first 1.7.4 pre-release. This is **not** Beta 1.7.3 (2011) or 1.7.10. AiSlopcraft is **not affiliated with, sponsored by, or endorsed by Mojang Studios or Microsoft**. No proprietary Mojang code/JAR/texture/audio is included. We made our own 16-pixel art, shaders and sounds; the bundled Press Start 2P font is SIL OFL-licensed.

> **Status: first native milestone, NOT a complete recreation.** The core and an SDL3/OpenGL desktop executable compile and pass headless tests on Linux; this sandbox has no GL-capable desktop so **the graphical app has not been launched successfully or visually smoke-tested here**. The actual rendering, controls, GUI and Windows build need validation on real display hardware. See [feature matrix](docs/FEATURE_MATRIX.md), [asset matrix](docs/ASSET_MATRIX.md), [known limitations](docs/KNOWN_LIMITATIONS.md) and [roadmap](docs/ROADMAP.md). No pixel parity, vanilla seed parity, multiplayer compatibility or 1440p FPS claim is made.

## What the source currently provides

- C++20 core: 1.7-era numeric block/item IDs and metadata variants, basic mining/drop/harvest logic, inventory/stack limits/durability, an explicit partial crafting/smelting catalogue, furnace ticks.
- Deterministic *1.7-inspired* overworld terrain, climate biomes, caves, simple ores/trees (including deterministic cross-chunk canopies), superflat/large-biomes/Amplified approximations; preliminary Nether/End terrain generation without portals/progression. **Not** Java seed-compatible.
- 16×16×16 chunk sections, negative-coordinate floor division, CPU lighting rebuild and removal, block raycasting, basic gravity/fluids/crops. Fixed 20-Hz survival/creative physics, movement, food, health and falling damage (approximations).
- Binary, CRC-protected atomic-replace edits/player save format (`docs/SAVE_FORMAT.md`), not Anvil. Save limitations include container contents/entities/weather/scheduled ticks.
- SDL3/OpenGL 3.3 runtime code: face-culled sectional meshes, nearest-neighbor art atlas, grass-side tint overlay, animated water/lava/fire/portal tiles, time-of-day light/fog, original title/HUD/inventory/crafting/furnace/chest/options/death screens, mouse-look and keyboard controls, background chunk generator (one worker), per-frame upload budget, F2 screenshots. **Not yet visually verified** and many game features are missing.
- Original deterministic Python/Pillow asset authoring tool: 460 atlas names, six 8-frame strips, nine short WAV effects, licensed bitmap font atlas. 109 rare tile icons are marked **provisional** in `assets/tiles/coverage.tsv`; unique mob skins/models and full GUI artwork are not finished.

## Build and run

### Windows (primary target; CI intended, local Windows not available here)

Requires Windows 10/11, Visual Studio 2022 with C++ workload/MSVC and Windows SDK, CMake ≥3.20, a GPU/driver providing OpenGL ≥3.3, and internet for the **pinned** SDL3 3.4.18 archive. SDL3 is built from source on a clean checkout if not installed. Build from repository root:

```powershell
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --parallel 4
ctest --test-dir build -C Release --output-on-failure
.\build\Release\aislopcraft.exe --selftest
.\build\Release\aislopcraft.exe
```

Build Debug by changing `--config Release` to `--config Debug`. Keep the copied `build/Release/assets/` folder beside the executable. If distributing, copy the executable **and** `assets/` together; builds/saves are not committed.

### Linux (headless compiler/tests **actually run**; graphical launch blocked here)

Requires GCC 12+/Clang 16+, CMake ≥3.20, Ninja or Make, threads, a desktop with SDL3 video dependencies (X11 or Wayland plus development libraries) and a real OpenGL 3.3 driver. On Ubuntu install dependencies such as `libx11-dev libxext-dev libxrandr-dev libxcursor-dev libxi-dev libxfixes-dev libxss-dev libxkbcommon-dev libwayland-dev wayland-protocols libegl1-mesa-dev libgl1-mesa-dev libasound2-dev libudev-dev`. See [SDL build notes](https://wiki.libsdl.org/SDL3/README-linux). For this sandbox, SDL3 was compiled separately with `SDL_UNIX_CONSOLE_BUILD=ON`, dummy video/audio backends, and used via `-DCMAKE_PREFIX_PATH=/home/user/deps/sdl3-install`.

```bash
cmake -S . -B build/release -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build/release --parallel 4
ctest --test-dir build/release --output-on-failure
./build/release/aislopcraft --selftest
./build/release/aislopcraft
```

Core-only, explicitly without SDL3/OpenGL: `cmake -S . -B build/core -DVOXCRAFT_BUILD_APP=OFF && cmake --build build/core && ctest --test-dir build/core --output-on-failure`. The full app requires SDL3; CMake fails rather than silently skipping it if fetching is disabled and SDL3 cannot be found. No macOS support claim yet.

### Controls (runtime code, GPU testing pending)

| Input | Intended behavior |
|---|---|
| Title: Enter/L / N / C / P | Load last / create new named seed world / toggle starting mode / cycle world type |
| Title: type digits, Backspace | Change world seed before creating |
| WASD, mouse | Walk, look (captured during play) |
| Ctrl, Shift, Space | Sprint, sneak/descend, jump/swim/ascend |
| Left hold / right click | Mine / interact, place, eat or use bucket |
| 1–9 / mouse wheel | Select hotbar slot |
| E | Inventory/crafting; crafting table opens 3×3 grid |
| F (creative), G | Toggle flight / switch creative or survival |
| Esc / O | Pause / options from pause |
| Options: - +, [ ], V, M | Render distance, FOV, VSync, mute |
| F1 / F2 / F3 / F5 | Hide HUD / screenshot to `screenshots/` / debug overlay / save |
| Q | Discard one held item (there is not yet a physical dropped-item entity) |

`options.txt`, `saves/` and `screenshots/` stay local and are ignored by Git. Creating a new world selects a new unique folder so old saves are not overwritten. Use only assets you have the right to distribute; **no import of proprietary resource packs is shipped**.

## Tests, assets and benchmark

```bash
ctest --test-dir build/release --output-on-failure -V
./build/release/aislopcraft --selftest       # no GPU required
./build/release/aislopcraft --benchmark      # CPU-only, NOT game FPS
# Only on a GL 3.3 desktop, render two PNGs (no progress saved):
./build/release/aislopcraft --visual-smoke screenshots/smoke
# Rebuild original assets (requires Python 3.11+ and Pillow):
./build/release/dump_tiles > assets/tiles/list.txt
python3 tools/assetgen/generate.py
```

`voxcore_tests` checks block/item IDs, recipes/smelting, inventory, RNG/terrain/negative chunk boundaries, fluid/lighting addition and removal, physics/damage, and save round trips/CRC/interrupted-temp handling. `vox_asset_audit` decodes images, checks 20,816 registry face/icon lookups, animations, WAV headers and one CPU mesh. `vox_startup_smoke` runs the app's *headless* CLI. A green CTest result does not prove gameplay visuals or Minecraft behavior. The new `--visual-smoke` command attempts actual OpenGL title and in-world PNGs; **it cannot run in this sandbox** and its Linux CI software-renderer check is pending. It is not a client comparison or target-PC benchmark. Original pixel-art study: `assets/previews/art-study.png` (an atlas QA sheet, **not** a game screenshot).

The CPU-only benchmark reports one-chunk generation/mesh milliseconds and labels missing mob work; it is **not** the requested native-1440p seven-scene GPU benchmark. On a GPU-equipped PC, run at 2560×1440 and inspect F3, capture F2 screenshots and record frame-time distribution with an external profiler. See [performance plan](docs/PERFORMANCE.md). **No** performance result has been measured on the requested RTX 5060 Ti/i5-13400 machine.

## Development / legal

Source: `src/core/` platform-independent simulation, `src/platform/` SDL3 and GL symbols/audio, `src/render/` GL renderer, `src/game/` UI/game loop, `tools/assetgen/` original asset authoring and `tests/` CTest. Third-party licences: `third_party/stb/LICENSE`, `assets/fonts/OFL.txt`, pinned SDL3 zlib licence at its source archive, and project MIT `LICENSE`. Full feature gaps and next steps are deliberately kept visible in `docs/`.
