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
- **Rendering:** pixel-art atlas, face-culled chunks, incremental cross-chunk sky/torch light with proper removal, smooth per-vertex lighting and contact occlusion, emissive lava/torch/glowstone/furnace texels, consistent sRGB color management, day/night sky gradient, world-anchored clouds, and distance/underwater fog. Cinematic and Shader Lite presets render real directional sun shadow maps; Shader Lite adds animated water waves, fresnel sky reflections, and specular glints. Mobs, drops, particles, and the first-person hand share the same local-lighting model. Presets and brightness can be changed live in Options. This is a native Three.js/WebGL renderer, not an OptiFine/Iris shaderpack port.
- **Survival:** voxel movement and collision, jumping, sneak movement, swimming, fall/drowning/lava damage, hearts, armor, food healing, item drops, pickup, durability, and inventory.
- **Building:** block placement, tools and weapon durability, doors, ladders, beds, cake, buckets, TNT, gravity blocks, and fluid/lava reactions.
- **Crafting:** 2×2 inventory recipes and 3×3 crafting-table recipes; furnace input, fuel, progress, and output slots.
- **Farming:** hoe tilling, water-assisted farmland, crop growth, seeds, harvesting, bone meal, and growing saplings.
- **Creatures:** wandering farm animals, hostile night mobs, zombies and skeleton sunlight damage, creeper fuses, spider movement, mob drops, melee combat, and skeleton arrows.
- **Interface:** animated title screen, hotbar, health/armor/air indicators, inventory and crafting, furnace, pause/death screens, options, item tooltips, and F3 debug view. World edits, player inventory, position, health, and settings autosave in browser storage; each seed has its own save. Switching seeds in the URL starts a separate world.

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

- `src/world/` — block/item registry, seeded terrain, chunks, incremental lighting, and mesh generation
- `src/rendering.js` — shared voxel/entity shaders, presets, fog, and sun shadow map
- `src/entities/` — player physics, eating, and mob AI/combat
- `src/ui/` — inventory, crafting recipes, and furnace simulation
- `src/textures.js`, `src/audio.js`, `src/sky.js` — procedural visuals, WebAudio, and sky cycle

Not affiliated with Mojang or Microsoft. Made for fun.
