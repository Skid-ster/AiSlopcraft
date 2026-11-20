# AiSlopcraft

**[▶ Play AiSlopcraft](https://skid-ster.github.io/AiSlopcraft/)** · [Source code](https://github.com/Skid-ster/AiSlopcraft)

AiSlopcraft is a browser-based voxel survival game inspired by **Minecraft Java Edition Beta 1.7.3**. Explore a seeded world, mine and build, craft and smelt, grow crops, fight familiar mobs, or invite friends into a co-op world—all in a classic, pixel-art presentation.

It aims for the feel of that era: no hunger bar or sprinting, food heals directly, and the title and options screens use a release-era style rather than a modern Minecraft menu. It is an independent game, not a Minecraft client or an exact reimplementation. Built with JavaScript and Three.js; textures, sounds, terrain, and mobs are procedurally generated. No Mojang assets are bundled.

## Features

- **Explore:** seeded rolling terrain, caves, ores, beaches, deserts, snowy areas, forests, trees, and plants across a 128-block world.
- **Mine, build, and survive:** block breaking and placement, voxel movement and collision, jumping, sneaking, swimming, fall/drowning/lava damage, tools and weapon durability, item drops and pickup, hearts, armor, and inventory.
- **Craft and smelt:** 2×2 inventory recipes, 3×3 crafting-table recipes, and furnaces with input, fuel, progress, and output slots.
- **Farm and build:** till and irrigate farmland, grow and harvest crops, plant saplings, use doors, ladders, beds, cake, buckets, TNT, and more.
- **Meet the mobs:** farm animals and hostile night creatures, including zombie and skeleton sunlight damage, creeper fuses, spider movement, mob drops, melee combat, and skeleton arrows. Peaceful, Easy, Normal, and Hard difficulty settings adjust hostile encounters and damage.
- **Play together:** co-op rooms share block edits, chat, player positions, host-simulated mobs and combat, time, containers, dropped items, vehicles, and active projectile visuals. See [Multiplayer](#multiplayer) for relay setup and limitations.
- **Tune the look:** a native Three.js/WebGL renderer with four live presets—Classic, Vibrant, Cinematic, and Shader Lite. Cinematic and Shader Lite use stabilized directional sun shadows; Shader Lite adds animated water, reflections, and specular highlights. Fog, day/night lighting, brightness, and local light on entities are supported. This is not an OptiFine or Iris shaderpack port.
- **Use the classic-style interface:** title and texture-pack screens, options, inventory and crafting, hotbar, health/armor/air indicators, pause and death screens, item tooltips, and an F3 debug overlay.

## Play locally

Install [Node.js](https://nodejs.org/) and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). To create a separate world, add a named seed, for example `?seed=my-world`, to the URL. World edits, inventory, player position and health, and settings are saved in this browser; each seed has its own save.

To make a production build:

```bash
npm run build
```

The generated site is written to `dist/`.

## Multiplayer

Multiplayer uses a small WebSocket relay so players can meet and share world edits across different home networks without port-forwarding. GitHub Pages is static hosting and cannot run this relay, so deploy the included server once:

1. Create a free web service from this repository's `render.yaml` using [Render Blueprints](https://render.com/deploy?repo=https://github.com/Skid-ster/AiSlopcraft). The service starts `npm run multiplayer` and exposes a `/health` check.
2. Copy the service URL and convert it to a WebSocket URL ending in `/ws` (for example, `https://my-relay.onrender.com` becomes `wss://my-relay.onrender.com/ws`). Free services may sleep while idle, so the first connection can take a short while to wake them.
3. In the game's **Multiplayer** menu, enter the relay URL and a player name. Create a Survival or Creative world as a public room (listed) or private room (invite code only); private rooms can also have a password. Friends can browse public rooms or use the six-character invite code. Share the invite link and send any password separately.

Players on different networks connect to the same relay URL. The host must keep the game open: rooms and edit history are held in relay memory and end when the host leaves or the relay restarts. The host and guests need the same world seed; invite links include the host's seed and relay URL.

Co-op shares block edits, chat, positions, host-simulated mobs and mob combat, world time, chest/furnace contents, and dropped-item spawns and pickups. Vehicles and in-flight projectile visuals are also replicated. Each player's inventory and health remain personal. Vehicle movement is peer-reported, and the relay does not provide a cheat-proof authoritative simulation. Rooms are temporary and are not saved by the relay. Multiplayer uses the relay rather than peer-to-peer connections and does not require players to expose local ports.

For local development, run `npm run multiplayer` in one terminal and `npm run dev` in another, then enter `ws://localhost:8787/ws` in the lobby.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click to capture cursor) |
| Space | Jump, swim upward, or climb ladders |
| Shift | Sneak; helps avoid walking off edges |
| Left click (hold) | Break blocks or attack mobs |
| Right click (hold) | Place blocks, use items, or eat |
| 1–9 / scroll wheel | Select hotbar slot |
| E | Open inventory or close a container |
| Q | Drop one held item; Ctrl+Q drops the stack |
| Esc | Pause or close the current screen |
| F3 | Toggle debug overlay |
| F1 | Toggle HUD |
| T | Multiplayer chat when connected |

Change difficulty, video, controls, sound, and gameplay options from the title or pause menu. Shader presets can be switched live in Video Settings. From the title screen, **Texture Packs...** opens the local pack importer.

## Managing Java 1.7.x texture packs

In **Texture Packs...**, choose **Open Pack File...** to import a Java Edition 1.7.x resource-pack ZIP (including 1.7.10) or client JAR containing `assets/minecraft/textures/blocks/`. The manager lists installed packs so you can switch between one pack and the built-in textures, or delete a pack. Supported block sprites are processed in the browser and are not uploaded. Pack atlases are saved in browser storage where available. Use only assets you have the right to use.

This is a partial resource-pack importer: missing sprites fall back to the bundled art. It does not import item, entity, GUI, sky, colormap, or sound assets. Animated textures, including water and lava, use their first frame, and biome coloring is approximated. Chest faces and redstone wire retain their bundled art because their Minecraft layouts require special handling. Other project block-atlas tiles are mapped or explicitly aliased. Importing a pack changes textures only; it does not change the game's mechanics into Java Edition 1.7.3. Java Forge mods and OptiFine shaderpack ZIPs are not executable in this browser game. Its built-in WebGL shader styles implement selected Minecraft-like effects, but arbitrary multi-pass Minecraft shaderpacks are not compatible with the Three.js rendering pipeline.

## Development

```bash
npm test
npm run build
```

The test suite covers world generation and lighting, UI, textures, interaction, gameplay, fluids, redstone, vehicles, recipes, furnaces, mobs, rendering, resource packs, and multiplayer.

- `src/world/` — block/item registry, seeded terrain, chunks, lighting, and mesh generation
- `src/rendering.js` — shared voxel/entity shaders, presets, fog, and sun-shadow pass
- `src/entities/` — player physics, eating, and mob AI/combat
- `src/network/` and `server/` — WebSocket lobby client and self-hostable room relay
- `src/ui/` — menus, inventory, crafting, and furnace interfaces
- `src/world/textures.js`, `src/audio.js`, `src/sky.js` — procedural visuals, WebAudio, and sky cycle

Not affiliated with Mojang or Microsoft. Made for fun.
