# AiSlopcraft

A browser-based **Minecraft Beta 1.7.3 clone** — the beloved June 2011 version, before the
Adventure Update. Old terrain generation, no hunger bar, no sprint, hearts you refill by
eating, and the classic harsh per-face lighting.

Built with vanilla JavaScript + Three.js. All textures, sounds, terrain and mobs are
procedurally generated — zero Mojang assets included.

## Running

```bash
npm install
npm run dev        # → http://localhost:5173
```

Production build: `npm run build` (output in `dist/`).
Optional: `npm run dev -- --open "?seed=your-seed"` for a custom world seed
(append `?seed=name` to the URL).

## Features

### World (Beta-style)
- **128-block world height**, sea level 63 — just like beta
- Rolling hills, oceans, sand beaches, deserts with cacti, snowfields, forests, mountains
- Cave systems, ore veins by depth (coal → diamond), lava pools in the deep
- Oak trees, flowers, tall grass, mushrooms, sugar cane, pumpkins, clay
- Biome grass/foliage tinting (temperature + humidity colormap, classic green variation)
- Per-chunk skylight + block light with beta falloff (torch = 14, −1 per block)
- Classic face shading: top 1.0, sides 0.8/0.6, bottom 0.5, **no smooth lighting**
- 20-minute day/night cycle with sun, moon, stars, and the flat cloud layer at y=108
- Chunk loading/unloading around the player, editable world

### Survival gameplay
- Beta physics: 4.317 b/s walk, 1.25-block jump, no sprint, sneak, swimming, fall damage
- Hearts + armor-free health, **no hunger bar** — eating food heals directly (beta style!)
- Block breaking with correct beta mining times and tool requirements
  (stone needs a pickaxe to drop cobblestone, diamond needs iron…)
- Item drops, inventory pickup, 36-slot inventory + 9-slot hotbar
- **Crafting**: 2×2 in inventory, 3×3 at the crafting table — tools, swords, torches,
  furnace, building blocks, and more
- **Furnace** smelting with fuel/burn times: ores → ingots, sand → glass, logs → charcoal,
  food cooking
- **TNT** — ignite with flint & steel for a block-destroying explosion
- Mobs: pigs, cows, sheep, chickens (wander) + zombies, skeletons (arrows), **creepers**
  (fuse + explosion that craters the terrain), spiders — hostile mobs spawn at night
- Death screen + respawn, block-damage hurt flash, drowning bubbles

### Interface
- Classic title screen with animated yellow splash text
- Pixelated beta-style GUI (dirt title background, beveled panels)
- F3 debug screen (coords, fps, biome, seed, light levels)
- F1 hide HUD · E inventory · Esc pause · Options (render distance, volume, sensitivity)

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click to capture cursor) |
| Space | Jump / swim up |
| Shift | Sneak |
| Left click (hold) | Break block / attack |
| Right click | Place block / use (crafting table, furnace, TNT, eat) |
| 1–9 / scroll | Select hotbar slot |
| E | Inventory |
| Esc | Pause |
| F3 | Debug overlay |
| F1 | Toggle HUD |

## Tech notes

- `src/world/` — seeded Perlin noise, beta-style generator, chunk storage,
  BFS light propagation, greedy face-culled mesher with baked vertex lighting
  (sky light dims at night via shader uniform; torch light stays warm-bright)
- `src/world/textures.js` — every 16×16 tile and item icon drawn procedurally
- `src/entities/` — AABB voxel physics for the player, box-model mobs with AI
- `src/audio.js` — all sounds synthesized with WebAudio (steps, digs, explosions…)
- `src/sky.js` — day/night, sun/moon/stars/clouds
- `src/ui/` — HUD, inventory, crafting, furnace; `recipes.js` is a compact recipe matcher

Not affiliated with Mojang or Microsoft. Made for fun.
