# AiSlopcraft

A browser-based **Minecraft Beta 1.7.3-inspired voxel survival game**. It aims for the classic feel: old-school terrain, no hunger bar or sprinting, health restored by food, and the familiar pixel-art GUI.

Built with vanilla JavaScript + Three.js. Textures, sounds, terrain and mobs are procedurally generated; no Mojang assets are included.

## Running

```bash
npm install
npm run dev        # → http://localhost:5173
```

Production build: `npm run build` (output in `dist/`). Add `?seed=your-seed` to use a named world seed.

## Game systems

- **World:** 128-block height, sea level 63, seeded rolling terrain, caves, ores, beaches, deserts, snowy areas, forests, trees, and plants.
- **Rendering:** pixel-art atlas, face-culled chunks, directional block faces, biome tint, per-block sky and torch light, day/night sky and clouds, distance fog, animated water/lava, block targeting and mining cracks.
- **Survival:** voxel movement and collision, jumping, sneak movement, swimming, fall/drowning/lava damage, hearts, armor, food healing, item drops, pickup, durability, and inventory.
- **Building:** block placement, tools and weapon durability, doors, ladders, beds, cake, buckets, TNT, gravity blocks, and fluid/lava reactions.
- **Crafting:** 2×2 inventory recipes and 3×3 crafting-table recipes; furnace input, fuel, progress, and output slots.
- **Farming:** hoe tilling, water-assisted farmland, crop growth, seeds, harvesting, bone meal, and growing saplings.
- **Creatures:** wandering farm animals, hostile night mobs, zombies and skeleton sunlight damage, creeper fuses, spider movement, mob drops, melee combat, and skeleton arrows.
- **Interface:** animated title screen, hotbar, health/armor/air indicators, inventory and crafting, furnace, pause/death screens, options, item tooltips, and F3 debug view.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click to capture cursor) |
| Space | Jump / swim upward / climb ladders |
| Shift | Sneak; helps avoid walking off edges |
| Left click (hold) | Break blocks / attack mobs |
| Right click (hold) | Place blocks / use items / eat |
| 1–9 / scroll wheel | Select hotbar slot |
| E | Inventory; close container |
| Q | Drop one held item (Ctrl+Q drops the stack) |
| Esc | Pause / close current screen |
| F3 | Debug overlay |
| F1 | Toggle HUD |

## Development

```bash
npm test
npm run build
```

- `src/world/` — block/item registry, seeded terrain, chunks, lighting, and mesh generation
- `src/entities/` — player physics, eating, and mob AI/combat
- `src/ui/` — inventory, crafting recipes, and furnace simulation
- `src/textures.js`, `src/audio.js`, `src/sky.js` — procedural visuals, WebAudio, and sky cycle

Not affiliated with Mojang or Microsoft. Made for fun.
