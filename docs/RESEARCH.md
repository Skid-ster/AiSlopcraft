# Release 1.7.3 research and evidence log

> Historical version/asset research remains relevant; old `src/core/` design decisions below refer to the **superseded prototype**, not the independent study. See [REBUILD_PLAN.md](REBUILD_PLAN.md) for current reference gates after the user's negative Windows retest.

**Target:** *Minecraft Java Edition release 1.7.3*, displayed as release 1.7.3 but technically the **first 1.7.4 pre-release**, dated **6 December 2013**. **Not** Beta 1.7.3 (2011) and **not** release 1.7.10. Our executable is named **AiSlopcraft**; it is unofficial, independently implemented, and does not contain Mojang game assets/code. This is a re-creation *goal*, not a compatibility or accuracy claim.

## Sources checked

| Source | Version-specific takeaway | Evidence class |
|---|---|---|
| [Minecraft Wiki — Java Edition 1.7.3](https://minecraft.wiki/w/Java_Edition_1.7.3) | First 1.7.4 pre-release, Dec 6 2013; protocol 4; resource-pack format 1; min Java 6. | Documented; no client binary redistributed |
| [Minecraft Wiki — 1.7.4 development versions, 1.7.3](https://minecraft.wiki/w/Java_Edition_1.7.4/Development_versions#1.7.3) | 1.7.3 fixes translation/Unicode font bugs, post-death PvP invisibility, Windows icon, hopper pickup from above, chicken-jockey behavior; it does **not** add the later 1.7.4 content. | Documented |
| [Minecraft Wiki — The Update that Changed the World](https://minecraft.wiki/w/The_Update_that_Changed_the_World) | 1.7.2 (Oct 25 2013) introduced 1.7 terrain/biomes, acacia/dark oak, stained glass, red sand, flowers, fish and fishing, Amplified, up-to-23×23 Nether portals. These belong in the 1.7.3 target. | Documented |
| [Minecraft Wiki — Java Edition 1.7.2](https://minecraft.wiki/w/Java_Edition_1.7.2) | Biomes avoid severe temperature boundaries; world types default/flat/large-biomes/Amplified; cave layout differs from Beta. | Documented |
| [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) | Trademark and asset restrictions require our own branding and content. No official textures/audio/code/JAR included. | Licensing guidance; review again prior to release |
| [SDL3 release tag](https://github.com/libsdl-org/SDL/tree/release-3.4.18) | zlib licensed platform layer; built from pinned tag snapshot. | Dependency inspection |
| [Press Start 2P SIL OFL](https://github.com/google/fonts/tree/main/ofl/pressstart2p) | Redistributable font bundled with OFL.txt from the prior repository tree. | License file in `assets/fonts/OFL.txt` |

The wiki was consulted through web-search text excerpts; the sandbox's outbound HTTP allowlist prevents downloading its pages or official reference screenshots here. These pages are **secondary** documentation, not hands-on reference-game tests. No official JAR was obtained or reverse engineered. Original screenshots from a legally run 1.7.3 client are still required for version-accurate visual verification.

## Implementation choices requiring comparison

- Registry IDs and variants in `src/core/{Blocks,Items}.*` intentionally use 1.7-era numeric IDs; *partial* mapping only. Check metadata/drops/recipes against release 1.7.3 independently before calling them verified.
- 256 world height, 16×16×16 sections, water surface Y=63 and a 24000-tick day are design targets. Our terrain, structures, climate, cave noise and populators are 1.7-**style**, not seed-for-seed 1.7.3 algorithms. Java's 48-bit RNG is implemented/tested independently; identical RNG does not imply identical worldgen.
- Tool/armor/food tables originate from documented 1.7-era data but have unverified entries; documented exceptions are in `KNOWN_LIMITATIONS.md`.
- Reproducing proprietary visual art is neither necessary nor permitted. Original textures aim for *recognisable classic materials*, not pixel-perfect original sprites.
- Our save format is a purpose-built local binary format, **not Anvil**. Network protocol 4 support has not been implemented.

## Next comparison tasks

1. Check recipes, item IDs and metadata against release-1.7.3-specific sources and in-client observations, including fish, podzol, double plants and fuel.
2. Capture screenshots at matched seed/FOV/weather/light for the seven scenes listed in `ASSET_MATRIX.md` on a machine with a GPU, desktop and a legally obtained release 1.7.3 client. Record resolution and matching conditions; don't commit proprietary screenshots without permission.
3. Record protocol 4 packets and login sequence from specification before considering multiplayer; no server compatibility claims without test against a legal local server.
4. Compare actual 1.7.3 world seed chunks, biome/structure placement and fluid tick behavior; code must remain labelled approximate until then.
