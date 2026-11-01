# Reference-led rebuild — decision record and acceptance gates

**Status: IN PROGRESS.** The user retested the previous Windows build and rejected its appearance and completeness. Green CI and earlier synthetic input tests do **not** supersede that result. The original prototype remains in Git history and as `aislopcraft` for rollback; this plan starts an **independent implementation path** (`src/rebuild/`, `aislopcraft-rebuild`) rather than continuing to polish its renderer/world/UI. We will not call the new path a release-1.7.3 recreation until its actual output has been compared against a lawful reference and the user accepts it. No existing `saves/` or `options.txt` files are touched by the new program. Never hard-reset the repository to achieve a "scratch" start.

## 1. Target and evidence, before more features

The reference is **Java Edition release-numbered 1.7.3, December 6, 2013** (a 1.7.4 pre-release), **not Beta 1.7.3**. The [version record](https://minecraft.wiki/w/Java_Edition_1.7.3) establishes identity; [1.7.2's 2013 feature list](https://www.minecraftforum.net/forums/minecraft-java-edition/recent-updates-and-snapshots/382343-minecraft-1-7-2-info) establishes the starting biome/content era. A [GUI sheet explainer](https://resourcepackcreator.com/guide/minecraft-gui-textures) gives provisional 182×22/24×24 hotbar geometry; check it against actual 2013 captures before treating it as exact. These secondary sources are **not** a visual reference. Modern screenshots, shader packs and Beta images are invalid references.

Acquire a **lawfully run** release-1.7.3 reference client capture (never bundle its JAR/assets/texture sheets). For each capture record the displayed version, resolution, FOV, GUI scale, Graphics Fast/Fancy, render distance, time/weather, seed and camera position/direction if known. Store user-provided reference images *outside the distributed assets* with permission; if no reference exists, the visual gate stays **BLOCKED**, not "approximately verified." The user can supply their Windows screenshot of *this* build for direct review. Never claim pixel-perfect equality with proprietary art: use original textures, independent code and our own branding, comparing proportions, composition, legibility, materials, lighting and interaction, not copying sprites.

Reference scenes (capture current program at matched camera/settings and compare side by side with an equivalent reference composition):

| ID | Scene and what to inspect |
|---|---|
| R1 | Clear daylight plains/forest edge: sky/horizon, cloud silhouettes, grass/dirt/stone tile frequency, tree silhouette, view distance, held item, crosshair/hotbar. **First gate.** |
| R2 | Dense oak/dark-oak foliage: cutout depth, color, lighting under canopy, frame cost. |
| R3 | Torch-lit cave/stone: light falloff, occlusion, contrast and texture legibility. |
| R4 | Beach/river with water/glass: tint, transparency order, horizon/fog. |
| R5 | Survival and creative HUD, inventory and title: logical pixel geometry, icon scale and readability. |
| R6 | Dusk/night and weather: daylight curve, moon/sun/clouds, rain/snow visibility. |
| R7 | 2013 terrain variety: hills/biomes, trees/flowers, boundary continuity and streaming stutter. |

Record comparisons in a review log with **reference URL/permission, matching conditions, both screenshots, visible discrepancies, decision/fixes, and reviewer/date**. Compare at native 1280×720 and 2560×1440 with an integer-scaled GUI; inspect crops at 100% and full frame. Pixel metrics (hotbar width/position, horizon location, luminance histogram) assist review; they cannot certify aesthetic parity. The same user who rejected the first build should review R1 before we expand content. **No comparable 2013 capture or reviewed side-by-side exists today.**

## 2. Implementation sequence (gated, not a feature dump)

| Gate | Work and exit condition | Current status |
|---|---|---|
| M0 — clean seam | Keep the legacy executable/history/saves intact. Add isolated C++20 world/controller/raycast/mesh tests, a small *original* 16-pixel art palette, independent SDL3/OpenGL entry point, separate executable and truthful docs. Headless tests and full clean Windows/Linux CI must pass. | IN PROGRESS (local Linux Release 5/5 CTests with dummy SDL; clean Windows/Linux CI pending) |
| M1 — playable **art study** | One fixed, bounded daylight meadow with a forest edge, no fabricated worldgen/biome claims. Responsive WASD/mouse/jump/collision; visible selection; repeated creative break/place with immediate mesh change; nine-slot selection; properly scaled hotbar/crosshair; first-person hand/item or clearly document absence. Verify render and input via software-GL automation **and** user's real Windows controls. Capture R1 and address the largest mismatches; user reviews before calling the *look* accepted. | IN PROGRESS (code; real Windows/reference visual gate BLOCKED) |
| M2 — representative survival | Save format in a **new namespace** (e.g. `saves-rebuild/`, no implicit migration), inventory transactions, timed survival mining/drops, tools, health/hunger, crafting; test close/reload, damage and 100 consecutive break/place actions. No silent placeholders. | NOT STARTED |
| M3 — bounded world | 16×16 sections, bounded background generation, skylight/block light, water, cave, several 1.7-era biomes and structures. Add R2–R4 and R7 visual reviews with target-PC frame timing before adding more blocks. Do not call seeded terrain Java-compatible without independent tests. | NOT STARTED |
| M4 — remaining release scope | Mobs, complete 2013 blocks/items/recipes, redstone/fluids/farms, dimension/progression/weather/menus/sound and potentially multiplayer. Decompose into independently usable, tested slices; entries stay NOT STARTED unless implemented. Review R5–R6. | NOT STARTED |
| Release gate | Seven reviewed scene pairs, interaction and save acceptance, clean Windows/Linux CI, no bundled proprietary content, complete feature/limitation audit and real 1440p performance evidence. Explicit user approval required before release/merge. | BLOCKED |

Architecture constraint: M0/M1 may share the **licensed SDL3/stb dependencies and minimal GL symbol loader** with the old app, but not the old `Game`, `Renderer`, `WorldGen`, `Mesher`, GUI code, provisional 460-tile atlas or old save format. Implement visuals as a vertical slice rather than first building hundreds of unusable blocks. Original art and code must have clear provenance; an in-memory study must never claim persistence.

## 3. Concrete acceptance checks and diagnostics

- **Controls (M1):** On Windows, capture focus, mouse look without first-click misfire, WASD+diagonal normalized movement, jump and ground collision; pressing Esc releases mouse. Crosshair and raycast select the *same* solid block face within 4.5 blocks. In creative, left click removes and right click adds the chosen block immediately; verify 100 alternating edits across block/chunk boundaries without an invisible or stale target. Show counts/target/CPU render time in an optional diagnostic view. SDL-synthetic tests are supporting evidence, **not** proof of a physical Windows mouse.
- **Visuals (M1):** R1 reference comparison at matched 1280×720/2560×1440 settings, recording UI screen-space width/position, horizon composition, tree/grass texture and foliage cutouts. A genuine user review is the appearance gate. A PNG signature or mesh count does not satisfy this.
- **Performance (M1/M3):** Record warm 60-second sample for each representative scene, 2560×1440 on the user's i5-13400 / RTX 5060 Ti / 16 GB PC, VSync *off* for diagnosis and then on for feel. Proposed budget: at least 60 FPS sustained (median frame ≤16.7 ms, 95th percentile ≤20 ms, 99th ≤33.3 ms), no repeatable >100 ms edit/streaming hitch after warm-up; record peak RAM/VRAM and device/driver. Capture CPU update/mesh/draw/swap timings separately. This budget is a **target**, not a result; target PC is not attached here. If unmet, profile before changing algorithms.
- **CI (each change):** C++ core/controller/mesher unit tests, Release application build on Windows MSVC and Linux, executable core selftest; Xvfb/Mesa startup, actual frame capture and edit-driven visual change on Linux when available. CI cannot establish visual fidelity or physical Windows responsiveness.

## 4. Explicit boundaries

- The old binary remains named `aislopcraft` and is **superseded for visual work**, not deleted. New executable `aislopcraft-rebuild` is a **limited study**, not yet a replacement game. Its world is in-memory; old saves remain untouched. Do not point the user at the legacy binary as proof of the rebuild.
- No Mojang-owned source, textures, sounds, branding or JARs in the repository or build bundle. Reference imagery is for private comparison only. The project is unofficial, independently made, and unaffiliated with Mojang/Microsoft.
- Status vocabulary: **NOT STARTED**, **IN PROGRESS**, **IMPLEMENTED**, **VERIFIED**, **BLOCKED**. VERIFIED needs a named test of a *narrow* behavior or an actual reference comparison; compiled != visually verified.
