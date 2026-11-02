# AiSlopcraft save format v1 (NOT Anvil / NBT)

**Filename:** `saves/<world-name>/world.bin`, plus `world.bin.tmp` while saving. The loader ignores `.tmp`. The UI must sanitise world names: do not accept `..`, absolute paths, separators or invalid characters. v1 stores **seed + deterministic worldgen + every edited block** rather than full chunk snapshots. It therefore relies on unchanged generator behavior across versions; a future migration/version bump will be needed when the terrain algorithm changes. Only one dimension is represented per file currently. No vanilla Java save compatibility is implied.

All numbers are little-endian; signed values use their 2's-complement bit pattern. Byte order:

| Field | Size |
|---|---:|
| magic ASCII `ASLWLD01` | 8 |
| format version (1) | u32 |
| world seed | i64 |
| world type (0 default, 1 flat, 2 large biomes, 3 amplified) | u8 |
| dimension (0 overworld, -1 nether, 1 end) | i8 |
| world time, ticks | u64 |
| player x, y, z, yaw, pitch | 5 × IEEE 754 f32 |
| player health, hunger | 2 × i16 |
| saturation | f32 |
| experience | i32 |
| selected hotbar index, creative | 2 × u8 |
| 36 player inventory slots: item ID u16, count u8, metadata/damage u16 | 36 × 5 |
| edited-block record count | u32 |
| repeated record: chunk x i32, chunk z i32, local index u16 (`y<<8 | z<<4 | x`), block ID u16, metadata u8 | count × 13 |
| CRC32 of all previous bytes (poly 0xEDB88320) | u32 |

Records are sorted by (chunk key, local index) before writing; last edit wins. The loader checks magic/version, CRC, exact end-of-file, max 64 MiB, max one million edits, valid block IDs/metas/positions/player state/stack limits and duplicate edit indices. It reports errors rather than silently loading corrupt data. The writer writes `world.bin.tmp`, flushes/closes it and atomically renames/replaces the old file only after the write succeeded. On interrupted pre-rename writes, the old save remains; tests simulate a leftover `.tmp`. **Power-loss durability is not guaranteed** without directory/file fsync and backup generations. Concurrent writers to the same path are unsupported.

**v1 exclusions:** entities/mobs, weather, furnace progress, scheduled ticks, NPC/container inventories, alternate dimension saves and player armor/XP level details. These are required before claiming complete persistence. The format is intended for the first playable milestone only.
