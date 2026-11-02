# Rebuild preview save v1 (separate from legacy worlds)

**IN PROGRESS — narrow creative-study persistence, not a complete world save.** `aislopcraft-rebuild` reads/writes only `saves-rebuild/study-v1.bin` **beside the executable** (not relative to the launcher working directory). It **never** reads, modifies or migrates the superseded executable's `saves/`, `options.txt` or Anvil/NBT files. `saves-rebuild/` is ignored by Git. Starting the program restores a valid study, F5 saves explicitly, autosave runs after about 60 seconds of active play, and closing the window saves. `--smoke`/`--selftest` never read/write a user save. Block edits, player feet/camera direction and selected hotbar slot persist; the creative-flight **toggle** is session-only (a player saved in midair returns to walking/falling on reload). Inventory, fluids, entities, survival state, world seed, sound and time do **not** persist.

## Binary layout (all multibyte integers little-endian; floats IEEE 754 binary32)

| Offset | Size | Value |
|---:|---:|---|
| 0 | 8 | ASCII `ASRBSTU1` magic |
| 8 | 2 | Format version 1 |
| 10 | 2 | Study side length 96 |
| 12 | 2 | Study height 32 |
| 14 | 4 | Number of edited voxels N (0–294,912) |
| 18 | 20 | Player feet X/Y/Z, yaw and pitch (5 floats) |
| 38 | 1 | Hotbar selection 0–8 |
| 39 | 1 | Study scene revision 1; future topology changes must increment this |
| 40 | 2 | Zero reserved bytes |
| 42 | 4N | Repeated `(x+48, y, z+48, block)` bytes. Each coordinate is 0–95, y 1–31, and block ID 0–10; entries must be unique and actually differ from the fixed-scene baseline. |
| 42+4N | 4 | CRC32 of all prior bytes (standard polynomial `0xEDB88320`) |

A loader rejects malformed length, checksum, version, scene revision, duplicate coordinates, unsupported block, invalid player floats/coordinates/slot and redundant edits **before** replacing the live world. If the main save is invalid and `.bak` is valid, it restores the backup, logs the problem, and leaves the damaged primary file untouched until the next save. If both fail, the game starts a default scene and **disables autosave and save-on-exit** so the invalid files are not silently overwritten; F5 is an explicit choice to start writing a fresh study. The saved camera is validated against finite world bounds, but this format does not solve every game-state recovery problem.

Writes go to same-directory `.tmp`, are flushed/closed, and atomically replace the primary file (POSIX rename; Windows `MoveFileExW` with replace and write-through). Before replacement, a **valid** existing primary is copied to `.bak`; a corrupted primary does not replace a good backup. Errors are reported in the console and on-screen rather than claiming a successful save. A flush/rename plus backup is **not** a guarantee of power-loss durability on every filesystem (there is no POSIX directory `fsync` here). Keep your own backup before experimenting.

`rebuild_core_tests` exercises a two-edit round trip, camera/slot, non-interference with a sentinel in `saves/`, successful backup recovery after checksum corruption, preservation of the good backup while replacing a bad primary, and refusal to load truncated main+backup. This proves these specific invariants only, not cross-version migration or full Java world compatibility.
