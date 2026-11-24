# Minecraft Java 1.7.10 research for AiSlopcraft

Research date: 2026-11-24. Scope: mechanics and product direction, not a complete specification or a claim of Minecraft compatibility.

## Conclusion

Build **one 1.7.10-inspired edition** with **Survival and Creative available in both singleplayer and multiplayer**. They are game modes, not separate editions or separate world generators. Release 1.7.10 (June 26, 2014) is not Beta 1.7.3 (July 2011): the similarly numbered releases are years apart. The 1.7.10 patch itself mainly changed Realms; the relevant game accumulated changes from Beta 1.8 through release 1.7.2 and later fixes. [P1], [P2], [S1], [S2], [S7]

Use original or appropriately licensed art, sound, interface graphics, names and branding. These sources describe mechanics; they do **not** grant permission to copy Minecraft assets, code, world files, trademarks, or protocol. An inspired sandbox need not reproduce seed-for-seed terrain or connect to Minecraft servers.

**Evidence key:** P = first-party Mojang/Minecraft source; S = secondary Minecraft Wiki history/reference. Historical wiki details are useful, but modern wiki body text may describe newer behavior. The notes below cite version history or version-specific pages where possible; exact unverified details are listed separately.

## What changed from Beta 1.7.3

### Game modes

- **Survival:** acquire finite resources, use tools and their durability, craft, eat, take damage, die, drop items by default, and respawn. Health, hunger and XP are separate systems. Some exceptions exist, so don't implement every action as a generic block edit. [S2], [S3], [S9]
- **Creative:** a categorized/searchable inventory grants items without gathering; blocks break rapidly and placement does not consume the stack; flight is toggled by double-jumping; normal survival damage and hunger constraints do not apply. It is not absolute invulnerability: the void and administrative commands are exceptions. Beta 1.7.3 did not have accessible Creative in its normal game; Beta 1.8 reintroduced it. [S1], [S2], [S3]
- Minecraft also had Adventure and Hardcore by this era, but they are **not** part of the requested product scope. [P4], [S10]

### Hunger, movement, food and health

The key Beta-to-release change is **not** just a different food item: Beta 1.7.3 food directly restored health, whereas Beta 1.8 introduced a food meter and ordinary food restores hunger instead. A standard player has 20 health points (10 hearts) and 20 food points (10 icons); one point is a half-heart or half-icon. [S1], [S2], [S4]

- **Hunger and sprint:** sprinting is available when food is **greater than 6**; at 6 or below it stops/is unavailable. Beta 1.8 used double-tap forward; by 1.7.2 a dedicated, rebindable sprint key also existed. Creative does not have the Survival hunger restriction. [S2], [S4], [S11]
- **Hidden saturation and exhaustion:** food restores hunger and also saturation; activity accumulates exhaustion, draining saturation before visible hunger. Sprinting and jumping are costly; the 1.7.2 history specifically records sprint-jump exhaustion changing to 0.8, so don't copy modern per-action numbers wholesale. [S4]
- **Healing:** with normal natural regeneration enabled and hunger at least 18/20, heal **1 health point every 80 ticks / 4 seconds** while injured; healing adds exhaustion. The full-hunger fast saturation-healing branch is a **1.9** addition, not 1.7.10. Peaceful and effects such as potions have separate rules. [P5], [S2], [S4], [S12]
- **Starvation:** at zero hunger, periodic damage is difficulty-dependent: Easy stops at 10 health points, Normal at 1, Hard can kill; Peaceful does not cause starvation. Automatic refilling of depleted hunger on Peaceful is listed as a **1.8** change, so do not infer that newer behavior for 1.7.10. [S4]
- **Eating:** most ordinary food is consumed over about 1.6 seconds and cannot be eaten at full hunger; special foods/effects have exceptions. Raw chicken and rotten flesh can inflict Hunger. Exact 1.7.10 food values and exception lists need a version-specific audit. [S2], [S4]

### Inventory, crafting and combat

- Survival inventory has **27 storage slots + 9 hotbar slots**, four armor slots and a **2×2** personal crafting grid. A placed crafting table provides a **3×3** grid. Stack limits vary by item; tools and armor have durability. This basic crafting/inventory pattern already existed in Beta and is not itself a new 1.7 feature. [S9]
- Creative's catalog/search and Survival inventory tab existed by release 1.3.1. Inventory interactions and container contents matter in multiplayer; a craft consumes inputs and produces outputs rather than simply granting a requested item. The built-in recipe book is later Java 1.12, so an optional original recipe-help UI would be an **intentional accessibility deviation**, not 1.7.10 fidelity. [S3], [S9], [P8]
- Beta 1.8 added sprinting, critical attacks and a draw/charge bow in place of Beta 1.7.3's rapid-fire bow. Release 1.7.10 predates the **1.9** combat update: don't silently add its weapon attack-cooldown system, shields or offhand/dual-wield slot. Existing hit immunity and attack validation are separate from a modern attack-charge cooldown. [S1], [S2], [S12]

### World generation and height

- Mojang's 1.2 Anvil announcement raised the Overworld build height from **128 blocks to 256**, meaning addressable block Y values **0–255**; Beta 1.7.3 was in the former 128-block era. Anvil used 16×16 horizontal chunks with up to sixteen 16-block-high sections. The browser may use its own storage format; that does not imply `.mca` compatibility. [P3], [S13]
- The 1.7.2 *Update that Changed the World* overhauled generation, roughly doubled biomes, reduced huge oceans, and added an optional Amplified world type. Examples include savanna/acacia, roofed forest/dark oak, mesa/red sand, mega taiga/podzol and flower forests; stained glass and additional flowers are also period-appropriate. These are 1.7.2-era changes inherited by 1.7.10, not new additions of the 1.7.10 patch. [P2], [S8], [S11]
- Compared with Beta 1.7.3, later worlds can include rivers, ravines, villages, mineshafts and strongholds; villagers and trading arrived later. Beta already had caves, biomes, the Nether, and a day/night cycle: do not attribute all of those to release 1.7.10. Generation was expansive/chunk-based, not a small finite Classic-style map. [P4], [S2], [S3]

### Day/night and hostiles

- The Overworld cycle is **24,000 ticks / 20 minutes** at 20 ticks per second; this predates Beta 1.7.3. Darkness enables typical hostile spawning on suitable terrain; light sources help protect spaces, including underground or covered areas during daytime. Zombies and skeletons can burn in direct sunlight. Existing daytime hostiles and exceptions mean “night = mobs, day = none” is wrong. [S6], [S8]
- For a 1.7-era approximation, common Overworld hostiles such as zombies, skeletons, spiders and creepers can spawn at light **7 or below**, subject to other conditions. This is not a universal rule for every mob, dimension or spawner. Modern Java 1.18 changed the **block-light** condition to 0 while retaining a separate sky-light check; don't mistake that for the older rule. [S14], [P7]
- Difficulty, spawn radius/caps, dark caves, hostile AI, line of sight, combat and sleeping all interact. Preserve a shared world clock in multiplayer; nights should not independently advance per client. Exact historic spawn algorithms and sleep edge cases are out of scope here. [S6], [S14]

### Experience and enchanting

- Beta 1.7.3 had no XP/enchanting loop. XP orbs appeared in Beta 1.8 and enchanting in release 1.0; by 1.3, mining eligible ores and taking smelted output could also grant XP. [S1], [S2], [S10], [P4]
- In 1.7.10 an enchanting table offers randomized choices for eligible items, with nearby bookshelves raising the available power; **15 bookshelves permit a level-30 option**. The selected displayed number is the number of experience levels consumed. The later **1.8** redesign added lapis consumption, a 1–3-level actual cost and an enchantment hint; these are not 1.7.10 rules. [S3], [S5], [P6]
- Enchanted books and anvils existed, as did fishing enchantments and treasure fishing in 1.7.2. Enchantment eligibility, outcomes, XP curves, repair costs and offer reroll behavior need version-specific verification before asserting parity. [P2], [S5], [S11]

### Multiplayer

By release 1.3.1, Mojang had unified singleplayer around an internal multiplayer server and allowed local worlds to be opened to LAN. Release 1.7.2 changed networking and multiplayer presentation; 1.7.10's Realms announcement highlighted uploading local worlds, server settings and activity monitoring. These facts support one shared set of gameplay rules, not a need to implement Mojang accounts, Realms, Java networking or interoperability. [P1], [P2], [P4], [S3]

**AiSlopcraft recommendation:** one world/session state with a local simulation for solo and an authoritative server or clearly trusted host for multiplayer. Synchronize world edits and containers, per-player mode/inventory/health/hunger/XP/spawn, clock, mobs, dropped items and interactions. Validate Survival actions and resolve simultaneous pickups/crafts/edits atomically; Creative grants must be permission-controlled. A host-authoritative design permits a dishonest host; a relay forwarding client claims is not by itself authoritative. Reconnect/snapshot recovery and persistence need explicit policies. This is engineering guidance, not a claim about the exact Minecraft wire protocol.

The existing project note [`relay-authority.md`](relay-authority.md) describes a non-inventory-authoritative relay supporting shared Survival and Creative rooms as well as the legacy Classic wire edition. Multiplayer Survival remains incomplete: current clients restrict guest chest/furnace access and disable storage-minecart interaction, but older or modified clients can bypass these safeguards.

## Practical priorities and checks

1. **One ruleset and two modes in both session types:** world creation/join, mode-specific abilities, shared block and entity state, persistent world/player saves; no separate Classic edition. Implement an original Creative catalog and flight, and a playable Survival mine → craft → shelter → eat loop.
2. **Survival integrity:** inventory/stack transactions, durable tools, drops and pickup, crafting-table/furnace progression, health, death/respawn, food/exhaustion and sprint. Confirm that at hunger 18 an injured player heals at the slow cadence, at 17 this stops, and at 6 sprint stops. Test starvation per difficulty.
3. **World feel:** 0–255 vertical block range, reproducible chunk generation, a small representative set of climate/biome and tree types, caves, light, a 20-minute day and a few mobs with day/night behavior. Approximation is acceptable if identified as such; do not promise Minecraft-identical seeds.
4. **Multiplayer parity:** two players each exercise Survival and Creative, see the same edits/clock/mobs/drops, cannot double-collect or duplicate a crafting input, and recover consistent state after reconnect. Explicitly test mode permissions and malicious/invalid requests; document host trust.
5. **Progression after the core loop:** XP sources, old-style enchanting/bookcases, then additional biomes, structures, farming, fishing, animals, villagers, Nether/End and other content as feasible. Implementing every vanilla item, boss, redstone circuit or generated structure is not required to call the game inspired.

## Limits and follow-up

- Values such as full exhaustion tables, detailed food effects, exact hostile spawning/despawning, AI/combat timings, XP/level curves, enchanting probabilities and reroll behavior, precise crafting recipes, and Nether/End world behavior are **not comprehensively verified** here. Validate against legally available version-specific primary evidence or controlled tests before claiming exact parity.
- Several secondary references include current gameplay alongside history; use the cited **history/version sections**, not today's general rules, for version claims. No game runtime or original Java 1.7.10 build was executed for this research.
- Mojang's archived 1.7.10 announcement is contemporaneous but prospective; the release date is corroborated by the secondary version record. This note does not establish the complete changes between 1.7.2 and 1.7.10.
- Future mechanics mentioned only as contrasts (1.8 enchanting and content, 1.9 combat and regeneration, 1.12 recipe book, 1.18 mob light and height changes) should not accidentally become 1.7.10 facts.

## Sources

### First-party

- [P1] Mojang, “Minecraft 1.7.10 on Thursday! More Realms!” (2014, archived): https://web.archive.org/web/20140701103215/https://mojang.com/2014/06/minecraft-1-7-10-on-thursday/
- [P2] Mojang, “Minecraft 1.7.2: The Update that Changed the World” (2013, archived): https://web.archive.org/web/20131029192852/https://mojang.com/2013/10/minecraft-1-7-the-update-that-changed-the-world/
- [P3] Mojang, “New Minecraft Map Format, Anvil” (2012, archived): https://web.archive.org/web/20120302221152/http://www.mojang.com/2012/02/new-minecraft-map-format-anvil/
- [P4] Mojang, “Minecraft 1.3 Info + Snapshot w27” (2012, archived): https://web.archive.org/web/20120707195630/http://www.mojang.com/2012/07/minecraft-1-3-info-snapshot-w27/
- [P5] Mojang, “Minecraft snapshot 13w23a” (2013, archived; regen gamerule): https://web.archive.org/web/20130608022416/https://mojang.com/2013/06/minecraft-snapshot-13w23a/
- [P6] Mojang, “Minecraft 1.8 Pre-release – The Bountiful Update” (2014, archived; **later-version comparison**): https://web.archive.org/web/20140822113047/https://mojang.com/2014/08/minecraft-1-8-pre-release-the-bountiful-update/
- [P7] Mojang, “Minecraft: Java Edition – 1.18” (later-version spawn and world-height comparison): https://feedback.minecraft.net/hc/en-us/articles/4415128577293-Minecraft-Java-Edition-1-18
- [P8] Mojang, “Block of the Week: Crafting Table” (archived retrospective on 1.12 recipe discovery): https://web.archive.org/web/20191114203945/https://www.minecraft.net/en-us/article/block-week-crafting-table

### Secondary historical references

- [S1] Minecraft Wiki, Beta 1.7.3: https://minecraft.wiki/w/Java_Edition_Beta_1.7.3
- [S2] Minecraft Wiki, Beta 1.8: https://minecraft.wiki/w/Java_Edition_Beta_1.8
- [S3] Minecraft Wiki, release 1.3.1: https://minecraft.wiki/w/Java_Edition_1.3.1
- [S4] Minecraft Wiki, food and history: https://minecraft.wiki/w/Food
- [S5] Minecraft Wiki, enchantment and history: https://minecraft.wiki/w/Enchantment
- [S6] Minecraft Wiki, daylight cycle and history: https://minecraft.wiki/w/Daylight_cycle
- [S7] Minecraft Wiki, release 1.7.10: https://minecraft.wiki/w/Java_Edition_1.7.10
- [S8] Minecraft Wiki, release 1.7.2: https://minecraft.wiki/w/Java_Edition_1.7.2
- [S9] Minecraft Wiki, inventory and history: https://minecraft.wiki/w/Inventory
- [S10] Minecraft Wiki, release 1.0.0: https://minecraft.wiki/w/Java_Edition_1.0.0
- [S11] Minecraft Wiki, 1.7.2 snapshot 13w36a: https://minecraft.wiki/w/Java_Edition_13w36a
- [S12] Minecraft Wiki, 1.9 Combat Update: https://minecraft.wiki/w/Java_Edition_1.9
- [S13] Minecraft Wiki, altitude history: https://minecraft.wiki/w/Altitude
- [S14] Minecraft Wiki, hostile mob spawning history: https://minecraft.wiki/w/Mob

[P1]: https://web.archive.org/web/20140701103215/https://mojang.com/2014/06/minecraft-1-7-10-on-thursday/
[P2]: https://web.archive.org/web/20131029192852/https://mojang.com/2013/10/minecraft-1-7-the-update-that-changed-the-world/
[P3]: https://web.archive.org/web/20120302221152/http://www.mojang.com/2012/02/new-minecraft-map-format-anvil/
[P4]: https://web.archive.org/web/20120707195630/http://www.mojang.com/2012/07/minecraft-1-3-info-snapshot-w27/
[P5]: https://web.archive.org/web/20130608022416/https://mojang.com/2013/06/minecraft-snapshot-13w23a/
[P6]: https://web.archive.org/web/20140822113047/https://mojang.com/2014/08/minecraft-1-8-pre-release-the-bountiful-update/
[P7]: https://feedback.minecraft.net/hc/en-us/articles/4415128577293-Minecraft-Java-Edition-1-18
[P8]: https://web.archive.org/web/20191114203945/https://www.minecraft.net/en-us/article/block-week-crafting-table
[S1]: https://minecraft.wiki/w/Java_Edition_Beta_1.7.3
[S2]: https://minecraft.wiki/w/Java_Edition_Beta_1.8
[S3]: https://minecraft.wiki/w/Java_Edition_1.3.1
[S4]: https://minecraft.wiki/w/Food
[S5]: https://minecraft.wiki/w/Enchantment
[S6]: https://minecraft.wiki/w/Daylight_cycle
[S7]: https://minecraft.wiki/w/Java_Edition_1.7.10
[S8]: https://minecraft.wiki/w/Java_Edition_1.7.2
[S9]: https://minecraft.wiki/w/Inventory
[S10]: https://minecraft.wiki/w/Java_Edition_1.0.0
[S11]: https://minecraft.wiki/w/Java_Edition_13w36a
[S12]: https://minecraft.wiki/w/Java_Edition_1.9
[S13]: https://minecraft.wiki/w/Altitude
[S14]: https://minecraft.wiki/w/Mob
