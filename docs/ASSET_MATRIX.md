# Original asset coverage and visual QA

Asset statuses: **NOT STARTED / IN PROGRESS / IMPLEMENTED / VERIFIED / BLOCKED**. *VERIFIED* for lookup/loading does **not** mean that artwork matches a release-1.7.3 screenshot. All atlas pixels, WAVs, animation frames and shaders are created in this project; the font is a bundled SIL OFL-licensed Press Start 2P.

| Category | Status | Coverage / evidence / caveat |
|---|---|---|
| Atlas mapping | VERIFIED | `dump_tiles` emits **460** names for all registered `blockTile` faces/metas and `itemTile` icons. `vox_asset_audit` verifies **20,816** registry lookups, decodes `assets/atlas.png` (512×240 RGBA) and reports zero missing mesh tiles in a flat-world chunk. This proves only registry-to-atlas coverage. |
| Block material art | IN PROGRESS | Hand-coded material-specific forms (strata/grain/bark/leaves/ore facets/bricks/flowers/crops); all 460 names have a tile. Complex blocks such as chests, beds, stairs and doors use simplified meshes. |
| Item tools/armor/food | IN PROGRESS | Distinct tool/armor/food silhouettes plus other icons. **108 rare names use provisional emblems**, listed individually in `assets/tiles/coverage.tsv`; these are not equivalent to finished art. Many block items display a 2D face instead of a true 3D icon. |
| Biome-coloured foliage/grass | IN PROGRESS | Neutral grayscale artwork is now multiplied once by biome colour in world meshes (with separate representative UI icon tint). Fancy leaves use ~84% opaque original pixel cutouts and depth writes instead of glass-style blending. Automated pixel audit checks neutrality/coverage, **not** 1.7.3 reference similarity. |
| Animated water/lava/fire/portal | IMPLEMENTED | Six original 8-frame 16×128 strips and manifest; renderer updates one 16×16 atlas subimage per tick interval. Pixel/GL output unverified. |
| GUI/hotbar/creative icons | IN PROGRESS | Original gray bevelled buttons/slots, outlined crosshair, block-target outline, mining progress bar, heart/hunger sprites and 48-slot creative catalogue. The user's earlier Windows HUD was too subtle; changed layouts still need another screenshot/reference comparison. |
| Player, hand and mob skins/models | NOT STARTED | No 3D character models, UVs or per-mob skins. First-person hand is not rendered. |
| Sky/clouds/sun/moon/weather/particles | IN PROGRESS | Time-dependent sky/fog colours exist; clouds, celestial sprites, precipitation and particles missing. |
| Original sound effects | IMPLEMENTED | Nine short generated 22,050 Hz mono WAVs (step/place/break/pickup/hurt/UI/splash). WAV headers audited; SDL playback code compiled, audio not listened to in a desktop run. No music. |
| Licensed fonts | VERIFIED | Press Start 2P OFL in `assets/fonts/OFL.txt`; `font_atlas.png` decodes. Glyph appearance in the app not yet checked. |
| Local proprietary resource-pack importer | NOT STARTED | Optional, deliberately omitted rather than unsafe ZIP handling. Game assets are self-contained. |

## Original art inspection

`assets/previews/art-study.png` was opened and inspected: material-specific grass/dirt/stone/planks/logs/leaves/ores/bricks/liquids/flowers/tools remain original pixel illustrations. A Windows screenshot subsequently exposed **double-colouring of already green grass/leaves**, producing dark noisy green, and sparse leaf gaps. The generator now emits neutral biome-tinted source tiles with denser 16px foliage; the QA study previews the biome tint. The art study is **not** a rendered-game screenshot, and the changed result has not yet been compared with the release client.

[Linux CI run 41329077878](https://github.com/Skid-ster/AiSlopcraft/actions/runs/41329077878) additionally rendered title, world and creative-menu frames under Mesa/Xvfb software OpenGL, validated three 1280×720 PNG signatures/dimensions and nontrivial sizes, and uploaded `aislopcraft-Linux-software-gl-captures`. Attempts to download the artifact in this sandbox failed because GitHub redirected to a blocked Azure Blob results host; **the PNG pixels were not opened or visually compared here**. Existence of image files proves neither correct UVs/UI nor 1.7.3 parity. The user's earlier Windows screenshot does confirm a GL frame but shows visual problems; after-fix Windows pixels/target-GPU FPS remain untested.

## Seven matching-reference scenes (NOT YET CAPTURED)

1. Block/variant wall with all six faces.
2. Item grid (tools, armor, dyes, fish and food).
3. Forest/plains/savanna/mesa/cold fixed-seed biomes.
4. Day/night cave and torch beside glass.
5. Water/lava/ice/stained glass (adjacent and separated).
6. Passive/hostile specimens walking/turning (blocked until mobs exist).
7. Title/options/HUD/inventory at 1280×720 and native 2560×1440.

Sandbox's SDL3 has dummy/offscreen video without OpenGL and no desktop/GPU. On a real PC, capture with F2, record 1.7.3 client build, screenshot provenance/rights, seed/world type, camera, FOV, time, GUI scale/resolution. Do not commit proprietary client screenshots without rights. No pixel-perfect parity claim.
