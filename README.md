# AiSlopcraft

**[▶ Play AiSlopcraft singleplayer](https://skid-ster.github.io/AiSlopcraft/)** · [Deploy multiplayer to Render](#deploy-to-render) · [Deploy to Azure](#deploy-to-azure)

AiSlopcraft is a browser-based voxel sandbox with two ways to play: the original **Beta 1.7.3-inspired survival game** and a dedicated **Classic creative mode**. Explore a seeded world, mine and build, craft and smelt, grow crops, fight familiar mobs, or switch to unlimited block-building and flight in Classic mode.

It aims for the feel of that era: no hunger bar or sprinting, food heals directly, and the title and options screens use a release-era style rather than a modern Minecraft menu. It is an independent game, not a Minecraft client or an exact reimplementation. Built with JavaScript and Three.js; textures, sounds, terrain, and mobs are procedurally generated. No Mojang assets are bundled.

## Features

- **Classic singleplayer and multiplayer:** create persistent Classic creative worlds with rolling grassland, trees, caves and ore veins, bedrock floor, the 49-block Classic palette, unlimited instant break/place, block picking, and double-tap flight. Save locally or host/join an account-free shared Classic world. No hunger, health loss, crafting requirement, or hostile mobs.
- **Beta singleplayer:** keep the existing Beta 1.7.3-inspired survival/creative experience, with separate named worlds, optional seeds, autosaves, rename/delete/re-create, and portable save import/export. Beta edition has no multiplayer entry point.
- **Explore Beta:** seeded rolling terrain, caves, ores, beaches, deserts, snowy areas, forests, trees, and plants across a 128-block world.
- **Mine, build, and survive:** block breaking and placement, voxel movement and collision, jumping, sneaking, swimming, fall/drowning/lava damage, tools and weapon durability, item drops and pickup, hearts, armor, and inventory.
- **Craft and smelt:** 2×2 inventory recipes, 3×3 crafting-table recipes, and furnaces with input, fuel, progress, and output slots.
- **Farm and build:** till and irrigate farmland, grow and harvest crops, plant saplings, use doors, ladders, beds, cake, buckets, TNT, and more.
- **Meet the mobs:** farm animals and hostile night creatures, including zombie and skeleton sunlight damage, creeper fuses, spider movement, mob drops, melee combat, and skeleton arrows. Peaceful, Easy, Normal, and Hard difficulty settings adjust hostile encounters and damage.
- **Classic multiplayer:** choose a temporary unique player name—no account or password—and browse public Classic worlds before joining or hosting. The relay allows up to five rooms and five players per room. Names are reserved only while connected. Classic sessions share block edits, chat, player positions, and world time; they do not include mobs. Rooms are temporary and do not overwrite singleplayer saves. See [Multiplayer](#multiplayer) for hosting and limitations.
- **Tune the look and performance:** a native Three.js/WebGL renderer with five live presets—Classic, Vibrant, Cinematic, Shader Lite, and **PSX (1.7.10)**. Cinematic and Shader Lite use stabilized directional sun shadows; Shader Lite adds reflective water, fine animated ripples, specular highlights, and sunlit glints. Video settings include Fast/Fancy rendering and All/Decreased/Minimal particles; Fast reduces internal resolution and skips dynamic shadow rendering. PSX is a real multi-pass WebGL preset adapted from the PS1-style affine mapping, depth-scaled vertex snapping, 25% render resolution, 24-step color grading, and ordered dithering in [ckosmic/Minecraft-PSX](https://github.com/ckosmic/minecraft-psx), whose README documents testing on Minecraft 1.7.10 and whose repository declares MIT terms (the checked-in license still has unfilled copyright placeholders). The shader logic is adapted to AiSlopcraft's Three.js render pipeline; it does not make arbitrary OptiFine shaderpack ZIPs executable. Fog, day/night lighting, brightness, and local light on entities are supported.
- **Use the classic-style interface:** title and texture-pack screens, options, inventory and crafting, hotbar, health/armor/air indicators, pause and death screens, item tooltips, and an F3 debug overlay.

## Play locally

Install [Node.js 22 LTS](https://nodejs.org/) (`>=22 <23`; Node 20 is unsupported) and run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). **Beta Singleplayer** browses Beta saves or creates a survival/creative world with an optional seed. **Play Classic** opens the separate Classic menu, where you can create/load saved creative worlds or host/join Classic multiplayer. Worlds autosave in this browser every 15 seconds, on tab hide, and on save-and-quit; the **World Saves** menu imports and exports portable JSON saves. Online rooms are temporary and never overwrite singleplayer saves.

On Windows, `npm test` prints a skip for the file-symlink assertion if the OS denies symlink creation. Enable Developer Mode or run with symlink privileges to exercise that assertion locally. All other tests still run; the server's symlink protection is unchanged.

To make a production build:

```bash
npm run build
```

The generated site is written to `dist/`. To automatically start the built production server on an ephemeral local port and exercise its HTTP, health, security-header, and WebSocket room flows, run:

```bash
npm run smoke:production
```

For the complete local release gate—full tests, clean production build, built-server HTTP/WebSocket smoke, and dependency audit—run `npm run verify`. CI runs the same gate on pull requests and pushes to `main`. To run the combined static-site/WebSocket service interactively instead, use `npm start`, then open `http://localhost:8787/` and check `http://localhost:8787/health`. The production server expects the build to exist; the Render Blueprint and Azure deployment instructions build it before starting. Use `BASE_URL=https://<your-service> npm run smoke:deploy` after an actual deployment; the local production smoke does not replace hosted-service verification.

## Classic multiplayer

Online multiplayer is available in the Classic edition; Beta remains singleplayer-only. It needs a reachable Node process to coordinate rooms and relay game state; static GitHub Pages cannot do that. Render and Azure run the built game and relay on the **same origin**. A single instance hosts at most **5 rooms**, each with at most **5 players including the host**. See the [relay authority matrix](docs/relay-authority.md) for protocol rules.

### Deploy to Azure

1. In Azure Portal, create an **App Service / Web App** (not Static Web Apps or a VM): Subscription **Azure for Students**, Publish **Code**, Runtime **Node.js 22 LTS**, OS **Linux**, and a UK region such as **UK South**.
2. Select a **Basic B1** App Service plan so you can enable Always On and WebSockets. Review the displayed cost first; B1 spends your student credit. Keep the scale-out worker count at **1** because room data lives in that single server process.
3. In **Deployment Center**, choose GitHub, authorize the repository, and select `Skid-ster/AiSlopcraft` on branch `main`. Let Azure create its deployment workflow.
4. In **Configuration → General settings**, set the startup command to `npm start`, turn **WebSockets** on, and turn **Always On** on. In **Configuration → Application settings**, add `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, then save and restart. The deployment builds the frontend (`npm run build`) and the start command serves it with the room service.
5. Wait for the deployment to finish, open `https://<your-app-name>.azurewebsites.net/health`, and confirm it returns `"status":"ok"`. Share the root app URL with players. Open Classic mode to host/join; the Classic Multiplayer screen uses its same-origin WebSocket automatically, so players do not configure Azure or a relay.

Azure keeps the **service process** available only while the App Service and subscription remain active; check your student-credit balance and expiry. Rooms and world edits are still temporary in-memory sessions: they end if the host leaves or the app restarts/deploys. Keeping world saves across restarts would require a database/storage feature not included here. GitHub Pages remains the singleplayer/static option and cannot itself host rooms.

### Deploy to Render

A `render.yaml` Blueprint is included for a single combined web service. In Render, choose **New → Blueprint**, connect this repository and the branch you want to publish, then review and create the `aislopcraft-online` service. The Blueprint builds the frontend and runs `npm start`; the Node engine range selects [Node 22 on Render](https://render.com/docs/node-version). The relay binds to Render's `PORT` (8787 by default locally) and `/health` checks the built app is ready. Players use the same site URL without entering a relay address. The Blueprint requests the `free` plan where available; keep one instance because room/name state is process-local. Free services may sleep, and rooms and names do not survive restarts or deploys. After deployment, run `BASE_URL=https://<your-service>.onrender.com npm run smoke:deploy` and share the service URL only after it passes. **The Blueprint does not provision a live service by itself.**

### Licensing

First-party material is [All Rights Reserved](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) document the PSX attribution and upstream terms.

Players on different networks connect to the same service URL. The host and guests need the same world seed; invite links include the host's seed and service URL.

### Player names and live leaderboard

Online play does not create accounts and never asks for a password or email. Choose a 3–20 character name using letters, numbers, or underscores. Names are case-insensitively unique across one room service while their player is connected. If a name is taken, the lobby says so and lets the player choose another. **Release the name in the lobby or disconnect** to make it available; it is not permanently yours and someone else can claim it when you are offline. The browser may remember your last choice locally for convenience, but that does not reserve it.

The **Online leaderboard** is a public live list of everyone connected to that room service, whether in a room or the lobby. It is an online roster, not a persistent score/rank table; no permanent profile or player history is stored. It resets when the service restarts. Keep one service instance: names and rooms live in that process, and running multiple instances without shared coordination could allow duplicate names and split room lists.

Room-password throttling ignores `X-Forwarded-For` by default because arbitrary clients can forge that header. If deployment traffic is guaranteed to pass through a known reverse-proxy chain, set `AISLOPCRAFT_TRUST_PROXY_HOPS` to the verified number of proxies that append client addresses to that header (1–10). Do not enable this setting until the provider's header behavior and ingress restrictions are verified; otherwise clients may spoof addresses and bypass throttling. With the default setting, requests are grouped by the direct socket peer, which may be a shared proxy address on hosted deployments.

When creating a room, the host can choose **Let each player choose** or **Force the host's shader and texture pack**. Individual mode is the default and leaves every player's visuals untouched. In forced mode the host selects a built-in shader style and an installed texture pack (or default textures); the supported 256×256 block atlas is relayed to room members, and each client restores its personal shader and textures after leaving. Shared atlas payloads are capped at 512 KB and held only in relay memory while the room is open.

Classic co-op shares block edits, chat, player positions, and world time. Classic worlds have no mobs, survival combat, inventory progression, chests, or vehicles. Host edits are uploaded in validated batches; player movement is peer-reported, so the relay is not a cheat-proof authoritative simulation. Rooms are temporary and are not saved by the relay. The service relays traffic rather than using peer-to-peer connections, so players do not expose local ports.

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
| E | Beta inventory; close a container |
| B | Open or close the Classic block picker |
| Double-tap Space | Toggle Classic flight |
| Q | Drop one held item in Beta; Ctrl+Q drops the stack |
| Esc | Pause or close the current screen |
| F3 | Toggle debug overlay |
| F1 | Toggle HUD |
| T | Multiplayer chat when connected |
| Hold Tab | Show the multiplayer player list and live relay ping |

Change difficulty, video, controls, sound, and gameplay options from the title or pause menu. Shader presets can be switched live in Video Settings. The **How to Play** guide is available from the title and pause menus. Touch devices have an on-screen movement joystick, drag-to-look area, held/tap action buttons, hotbar selectors, inventory/container panels with a visible return control, multiplayer chat, and pause; landscape orientation is recommended. From the title screen, **Texture Packs...** opens the local pack importer.

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
