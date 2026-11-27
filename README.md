# AiSlopcraft

**[▶ Play on Render](https://aislopcraft-online.onrender.com/)** · [GitHub Pages — singleplayer only](https://skid-ster.github.io/AiSlopcraft/) · [Hosting setup](#deploy-to-render)

AiSlopcraft is a browser-based voxel sandbox inspired by Java Edition 1.7.10. Choose **Survival** or **Creative** for singleplayer or multiplayer, explore a seeded world, mine and build, craft and smelt, grow crops, and fight mobs. Existing Classic worlds remain accessible from the world selector.

Survival includes hunger, held-to-eat food, regeneration, starvation, and sprinting. This is an independent game, not a Minecraft client or an exact reimplementation. Built with JavaScript and Three.js; textures, sounds, terrain, and mobs are procedurally generated. No Mojang assets are bundled. Hosted versions may lag behind this branch.

## Features

- **Singleplayer worlds:** create named Survival or Creative worlds with optional seeds, autosaves, rename/delete/re-create, and portable save import/export. Existing Classic and Beta saves keep their original terrain and build limits.
- **Explore:** new Overworlds build from Y=0 through Y=255. A versioned, seed-based generator creates river valleys, ridges, forests, deserts, snow, caves, and ores. The same seed and generator produce the same terrain regardless of chunk load order.
- **Create:** search or filter the Creative catalog, fill a chosen hotbar slot, break blocks instantly, and build without using up supplies. Double-tap Jump to toggle collision-aware flight, or use the Fly button on touch.
- **Mine, build, and survive:** block breaking and placement, voxel movement and collision, jumping, sneaking, swimming, fall/drowning/lava damage, tools and weapon durability, item drops and pickup, hearts, armor, and inventory.
- **Craft, smelt, and enchant:** 2×2 inventory recipes, 3×3 crafting-table recipes, furnaces with input, fuel, progress, output, and smelting XP, plus an **Enchanting Table** powered by nearby bookshelves (up to 15) with 19 classic 1.7.10 enchantments across tools, weapons, bows, armor, and Enchanted Books.
- **Enter The Nether:** build and ignite an Obsidian portal frame with Flint and Steel to travel at 1:8 / 8:1 scale into a seeded 128-block Nether (`nether-v1`) featuring lava seas, Soul Sand basins, Glowstone clusters, Nether Quartz veins, Nether Fortresses, Zombie Pigmen, Ghasts (with deflectable explosive fireballs), and Blazes.
- **Detailed pixel-art visuals:** UV-mapped pixel-art skins across all 11 Overworld and Nether mob species, remote player outfits, first-person arm, boats/minecarts, projectiles, and block/item atlases with emissive glow maps.
- **Farm and build:** till and irrigate farmland, grow and harvest crops, plant saplings, orient stairs and chests, connect fences, use doors, ladders, beds, cake, buckets, TNT, and more.
- **Meet the mobs:** farm animals and hostile creatures that spawn at night, in dark caves, or inside the Nether. Torches protect nearby Overworld spawn spaces; zombies and skeletons burn in direct sunlight. Peaceful, Easy, Normal, and Hard difficulty settings adjust hostile encounters and damage.
- **Multiplayer:** choose a temporary unique player name—no account required—and browse public Survival or Creative worlds. The relay allows up to five rooms and five players per room, synchronizes shared chests, furnaces, storage minecarts, and Nether travel, and supports automatic session reconnect. Rooms are temporary and do not overwrite singleplayer saves. See [Multiplayer](#multiplayer) for synchronization details.
- **Tune the look and performance:** a native Three.js/WebGL renderer with two clean presets—**Normal** (crisp 1.7.10 voxel lightmap, smooth AO, and still water) and **Shader** (stabilized 1536px Poisson-filtered sun shadows, warm directional sunlight with cool sky-dome shadows, sunlit foliage wind sway & subsurface translucency, reflective caustic water, directional Mie sun-haze, and ACES filmic tone mapping). Video settings include Fast/Fancy rendering and All/Decreased/Minimal particles; Fast reduces internal resolution and skips dynamic shadow rendering. Steady trilinear entity lighting, fog, day/night transitions, and brightness controls are supported without torch or shadow flicker.
- **Use the classic-style interface:** title and texture-pack screens, options, inventory and crafting, hotbar, health/armor/air indicators, pause and death screens, item tooltips, and an F3 debug overlay.

**Current limits:** Food, mobs, terrain, enchanting, and Nether mechanics are 1.7.10-inspired approximations. Java worlds/seeds are not compatible, and there is no brewing, anvils, or End dimension. Multiplayer synchronizes shared containers (chests, furnaces, storage minecarts) and dimension travel through the relay, while personal player inventories remain client-reported rather than server-authoritative.

## Play locally

Install [Node.js 22 LTS](https://nodejs.org/) (`>=22 <23`; Node 20 is unsupported) and run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). **Singleplayer** lists existing saves and creates Survival or Creative worlds; **Multiplayer** opens the lobby. Local worlds autosave every 15 seconds and when the tab is hidden during play. You can also save from the pause menu. **World Saves** imports and exports portable JSON saves. Online rooms are temporary and never overwrite singleplayer saves.

On Windows, `npm test` prints a skip for the file-symlink assertion if the OS denies symlink creation. Enable Developer Mode or run with symlink privileges to exercise that assertion locally. All other tests still run; the server's symlink protection is unchanged.

New Overworld backups use save format v2, which older builds intentionally reject rather than loading with the wrong terrain or dropping tall edits. Browser storage keeps Overworld saves separate from v1 Classic (64 blocks) and Beta (128 blocks) saves, so a cached older build cannot overwrite them. Development v2 saves move to the new storage key when opened or listed if there is room for a safe copy; if space is low, download a backup before using an older build. **Re-Create** makes a fresh copy from the selected seed and generator without replacing the original.

To make a production build:

```bash
npm run build
```

The generated site is written to `dist/`. To automatically start the built production server on an ephemeral local port and exercise its HTTP, health, security-header, and WebSocket room flows, run:

```bash
npm run smoke:production
```

For the complete local release gate, install the Chromium test browser once with `npx playwright install chromium`, then run `npm run verify`. It runs the Node/jsdom suite, production build, built-server HTTP/WebSocket smoke, [performance smoke](docs/performance.md), Chromium tests and dependency audit. GitHub Actions is configured to run that gate on Linux and `npm test` on Windows. The browser tests use an isolated local server; on a machine with a working GPU you can set `AISLOPCRAFT_HARDWARE_GL=1` to use native rendering instead of the software test renderer.

To play from the combined static-site/WebSocket build, run `npm start`, then open [http://localhost:8787/](http://localhost:8787/) and check [the health endpoint](http://localhost:8787/health). The production server requires `dist/` from `npm run build`. This local smoke does not replace verification against the hosted service.

In an active singleplayer world, **Pause → Download World Backup** exports current progress even if browser storage is full. If Save & Quit cannot write the save, it leaves the world open. A lost WebGL context pauses active play while the browser restores graphics; local backup remains available from the game menu.

## Multiplayer

Survival and Creative rooms need a reachable Node process to coordinate rooms and relay game state; static GitHub Pages cannot do that. Render and Azure run the built game and relay on the **same origin**. A single instance hosts at most **5 rooms**, each with at most **5 players including the host**. See the [relay authority matrix](docs/relay-authority.md) for protocol rules.

### Deploy to Azure

1. In Azure Portal, create an **App Service / Web App** (not Static Web Apps or a VM): Subscription **Azure for Students**, Publish **Code**, Runtime **Node.js 22 LTS**, OS **Linux**, and a UK region such as **UK South**.
2. Select a **Basic B1** App Service plan so you can enable Always On and WebSockets. Review the displayed cost first; B1 spends your student credit. Keep the scale-out worker count at **1** because room data lives in that single server process.
3. In **Deployment Center**, choose GitHub, authorize the repository, and select `Skid-ster/AiSlopcraft` on branch `main`. Let Azure create its deployment workflow.
4. In **Configuration → General settings**, set the startup command to `npm start`, turn **WebSockets** on, and turn **Always On** on. In **Configuration → Application settings**, add `SCM_DO_BUILD_DURING_DEPLOYMENT=true`, then save and restart. The deployment builds the frontend (`npm run build`) and the start command serves it with the room service.
5. Wait for the deployment to finish, open `https://<your-app-name>.azurewebsites.net/health`, and confirm it returns `"status":"ok"`. Share the root app URL with players. The Multiplayer screen uses its same-origin WebSocket automatically, so players do not configure Azure or a relay.

Azure keeps the **service process** available only while the App Service and subscription remain active; check your student-credit balance and expiry. Rooms and world edits are still temporary in-memory sessions: they end if the host leaves or the app restarts/deploys. Keeping world saves across restarts would require a database/storage feature not included here. GitHub Pages remains the singleplayer/static option and cannot itself host rooms.

### Deploy to Render

The public service is [aislopcraft-online.onrender.com](https://aislopcraft-online.onrender.com/). A free service can take a moment to wake up. Each origin keeps its own local saves; use **World Saves** to transfer a save between GitHub Pages and Render.

A `render.yaml` Blueprint is included for a single combined web service. In Render, choose **New → Blueprint**, connect this repository and the branch you want to publish, then review and create the `aislopcraft-online` service. The Blueprint builds the frontend and runs `npm start`; the Node engine range selects [Node 22 on Render](https://render.com/docs/node-version). The relay binds to Render's `PORT` (8787 by default locally) and `/health` checks the built app is ready. Players use the same site URL without entering a relay address. The Blueprint requests the `free` plan where available; keep one instance because room/name state is process-local. Free services may sleep, and rooms and names do not survive restarts or deploys. After deployment, run `BASE_URL=https://<your-service>.onrender.com npm run smoke:deploy` (PowerShell: set `$env:BASE_URL` first). Share the service URL only after it passes. **The Blueprint does not provision a live service by itself.**

Players on different networks connect to the same service URL. Invite links include the host's seed, terrain profile and service URL. The relay hides tall rooms from old clients and rejects their joins; legacy room discovery and joins still work.

### Player names and live leaderboard

Online play does not create accounts and never asks for a password or email. Choose a 3–20 character name using letters, numbers, or underscores. Names are case-insensitively unique across one room service while their player is connected. If a name is taken, the lobby says so and lets the player choose another. **Release the name in the lobby or disconnect** to make it available; it is not permanently yours and someone else can claim it when you are offline. The browser may remember your last choice locally for convenience, but that does not reserve it.

The **Online leaderboard** is a public live list of everyone connected to that room service, whether in a room or the lobby. It is an online roster, not a persistent score/rank table; no permanent profile or player history is stored. It resets when the service restarts. Keep one service instance: names and rooms live in that process, and running multiple instances without shared coordination could allow duplicate names and split room lists.

Room-password throttling ignores `X-Forwarded-For` by default because arbitrary clients can forge that header. If deployment traffic is guaranteed to pass through a known reverse-proxy chain, set `AISLOPCRAFT_TRUST_PROXY_HOPS` to the verified number of proxies that append client addresses to that header (1–10). Do not enable this setting until the provider's header behavior and ingress restrictions are verified; otherwise clients may spoof addresses and bypass throttling. With the default setting, requests are grouped by the direct socket peer, which may be a shared proxy address on hosted deployments.

When creating a room, the host can choose **Let each player choose** or **Force the host's shader and texture pack**. Individual mode is the default and leaves every player's visuals untouched. In forced mode the host selects a built-in shader style and an installed texture pack (or default textures); the supported 256×256 block atlas is relayed to room members, and each client restores its personal shader and textures after leaving. Shared atlas payloads are capped at 512 KB and held only in relay memory while the room is open.

Rooms share block edits, chat, player positions, world time, dimension transitions (Overworld and Nether), host-simulated entities, and relay-synchronized containers (**chests**, **furnaces**, and **storage minecarts**). Opening a menu online stops your input, not the shared world. Brief WebSocket drops automatically resume your in-room session (`session:resume`) within a short grace window without losing your slot or host ownership. **Personal player inventories remain local to each client rather than server-authoritative**; play with trusted people and keep backups. Host edits are uploaded in validated batches, while movement and personal bag state are client-reported. Rooms are temporary and are not saved by the relay. The service relays traffic rather than using peer-to-peer connections, so players do not expose local ports.

For local development, run `npm run multiplayer` in one terminal and `npm run dev` in another. Vite proxies the lobby's same-origin `/ws` connection to the local room service, so the address field can stay blank. The **Advanced** setting is only for overriding the endpoint or connecting from static-only hosting.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click to capture cursor) |
| Space | Jump, swim upward, or climb ladders |
| Shift | Sneak; helps avoid walking off edges |
| Ctrl | Sprint in Survival when food is above 6 |
| Left click (hold) | Break blocks or attack mobs |
| Right click (hold) | Place blocks, use items, or eat |
| 1–9 / scroll wheel | Select hotbar slot |
| E | Inventory or Creative catalog; close a container |
| B | Open or close the block picker in a legacy Classic world |
| Double-tap Space | Toggle flight in Creative or a legacy Classic world; use Jump/Sneak to rise/descend |
| Q | Drop one held item; Ctrl+Q drops the stack |
| Esc | Pause or close the current screen |
| F3 | Toggle debug overlay |
| F1 | Toggle HUD |
| T | Multiplayer chat when connected |
| Hold Tab | Show the multiplayer player list and live relay ping |

Change difficulty, video, controls, sound, and gameplay options from the title or pause menu. Shader presets can be switched live in Video Settings. The **How to Play** guide is available from the title and pause menus. Touch devices have an on-screen movement joystick, drag-to-look area, held/tap action buttons, hotbar selectors, inventory/container panels with a visible return control, multiplayer chat, and pause; landscape orientation is recommended. From the title screen, **Texture Packs...** opens the local pack importer.

## Managing Java 1.7.x texture packs

In **Texture Packs...**, choose **Open Pack File...** to import a Java Edition 1.7.x resource-pack ZIP (including 1.7.10) or client JAR containing `assets/minecraft/textures/blocks/`. The manager lists installed packs so you can switch between one pack and the built-in textures, or delete a pack. Supported block sprites are processed in the browser and are not uploaded. Pack atlases are saved in browser storage where available. Use only assets you have the right to use.

This is a partial resource-pack importer: missing sprites fall back to the bundled art. It does not import item, entity, GUI, sky, colormap, or sound assets. Animated textures, including water and lava, use their first frame, and biome coloring is approximated. Chest faces and redstone wire retain their bundled art because their Minecraft layouts require special handling. Other project block-atlas tiles are mapped or explicitly aliased. Importing a pack changes textures only; it does not make the game compatible with Java Edition. Java Forge mods and OptiFine shaderpack ZIPs are not executable in this browser game. Its built-in WebGL shader styles implement selected Minecraft-like effects, but arbitrary multi-pass Minecraft shaderpacks are not compatible with the Three.js rendering pipeline.

## Licensing

First-party material is [All Rights Reserved](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) document the PSX attribution and upstream terms.

## Development

```bash
npm test
npm run build
```

The test suite covers world generation (Overworld, Nether, and Classic), voxel lighting, portals, XP and enchanting, UI, block/item and entity pixel-art textures, interaction, gameplay, fluids, redstone, vehicles, recipes, furnaces, mobs, rendering, resource packs, portable world-save validation, and multiplayer rooms/containers/reconnect.

- `src/world/` — block/item registry, seeded Overworld/Nether/Classic terrain, portals, chunks, lighting, and mesh generation
- `src/enchanting.js` — 1.7.10 XP curve, bookshelf power, 3-slot enchanting offers, and tool/combat/armor modifiers
- `src/rendering.js` — shared voxel/entity shaders, presets, fog, and sun-shadow pass
- `src/entities/` — player physics, UV-mapped pixel-art skins (`entity-textures.js`), remote avatars, vehicles, eating, and mob AI/combat
- `src/network/` and `server/` — WebSocket lobby client, session resume, container authority, and self-hostable room relay
- `src/ui/` — menus, inventory, crafting, furnace, chest, and enchanting interfaces
- `src/world/textures.js`, `src/audio.js`, `src/sky.js` — procedural visuals, WebAudio, and sky cycle

Not affiliated with Mojang or Microsoft. Made for fun.
