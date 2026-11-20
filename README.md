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
- **Play together:** co-op rooms share block edits, chat, player positions, host-simulated mobs and combat, time, containers, dropped items, vehicles, and active projectile visuals. The multiplayer menu uses the site's room service automatically when available; see [Multiplayer](#multiplayer) for hosting and limitations.
- **Tune the look:** a native Three.js/WebGL renderer with five live presets—Classic, Vibrant, Cinematic, Shader Lite, and **PSX (1.7.10)**. Cinematic and Shader Lite use stabilized directional sun shadows; Shader Lite adds animated water, reflections, and specular highlights. PSX is a real multi-pass WebGL preset adapted from the PS1-style affine mapping, depth-scaled vertex snapping, 25% render resolution, 24-step color grading, and ordered dithering in [ckosmic/Minecraft-PSX](https://github.com/ckosmic/minecraft-psx), whose README documents testing on Minecraft 1.7.10 and whose repository declares MIT terms (the checked-in license still has unfilled copyright placeholders). The shader logic is adapted to AiSlopcraft's Three.js render pipeline; it does not make arbitrary OptiFine shaderpack ZIPs executable. Fog, day/night lighting, brightness, and local light on entities are supported.
- **Use the classic-style interface:** title and texture-pack screens, options, inventory and crafting, hotbar, health/armor/air indicators, pause and death screens, item tooltips, and an F3 debug overlay.

## Play locally

Install [Node.js](https://nodejs.org/) and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Choose **Singleplayer** to browse saved worlds or create one with an optional seed. Singleplayer worlds autosave in this browser every 15 seconds, on tab hide, and on save-and-quit; each world has its own save. The **World Saves...** menu exports/imports portable JSON save files. Multiplayer rooms are temporary and never overwrite personal singleplayer saves.

To make a production build:

```bash
npm run build
```

The generated site is written to `dist/`.

## Multiplayer

Online multiplayer needs a reachable process to coordinate rooms and relay game state; a static site alone cannot do that. To avoid making players configure a separate relay, this project can serve the built game and WebSocket room service from the **same origin and deployment**:

1. Create the included `render.yaml` web service with [Render Blueprints](https://render.com/deploy?repo=https://github.com/Skid-ster/AiSlopcraft). It builds the site and starts the combined app server.
2. Open the service URL. The Multiplayer menu connects to that same site's `/ws` endpoint automatically—players do not enter or configure a relay address. Create a Survival or Creative public room (listed) or private room (invite code only); private rooms may also have a password. Friends open the same game URL and browse or enter the six-character invite code.

GitHub Pages remains static and cannot host the room service. If you publish only on GitHub Pages, you must provide a custom `wss://` endpoint in Multiplayer settings. Free service plans may sleep while idle, so the first connection can take a short while to wake.

Players on different networks connect to the same relay URL. The host must keep the game open: rooms and edit history are held in relay memory and end when the host leaves or the relay restarts. The host and guests need the same world seed; invite links include the host's seed and relay URL.

When creating a room, the host can choose **Let each player choose** or **Force the host's shader and texture pack**. Individual mode is the default and leaves every player's visuals untouched. In forced mode the host selects a built-in shader style and an installed texture pack (or default textures); the supported 256×256 block atlas is relayed to room members, and each client restores its personal shader and textures after leaving. Shared atlas payloads are capped at 512 KB and held only in relay memory while the room is open.

Co-op shares block edits, chat, positions, host-simulated mobs and mob combat, world time, chest/furnace contents, and dropped-item spawns and pickups. Vehicles and in-flight projectile visuals are also replicated. Each player's inventory and health remain personal. Vehicle movement is peer-reported, and the relay does not provide a cheat-proof authoritative simulation. Rooms are temporary and are not saved by the relay. Multiplayer uses the relay rather than peer-to-peer connections and does not require players to expose local ports.

For local development, run `npm run multiplayer` in one terminal and `npm run dev` in another. Vite proxies the lobby's same-origin `/ws` connection to the local room service, so the address field can stay blank. The **Advanced** setting is only for overriding the endpoint or connecting from static-only hosting.

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

The test suite covers world generation and lighting, UI, textures, interaction, gameplay, fluids, redstone, vehicles, recipes, furnaces, mobs, rendering, resource packs, portable world-save validation, and multiplayer.

- `src/world/` — block/item registry, seeded terrain, chunks, lighting, and mesh generation
- `src/rendering.js` — shared voxel/entity shaders, presets, fog, and sun-shadow pass
- `src/entities/` — player physics, eating, and mob AI/combat
- `src/network/` and `server/` — WebSocket lobby client and self-hostable room relay
- `src/ui/` — menus, inventory, crafting, and furnace interfaces
- `src/world/textures.js`, `src/audio.js`, `src/sky.js` — procedural visuals, WebAudio, and sky cycle

Not affiliated with Mojang or Microsoft. Made for fun.
