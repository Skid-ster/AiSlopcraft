# Performance — legacy measurements and unverified rebuild target

> The old prototype's CPU timing below **does not transfer** to the independent `aislopcraft-rebuild`. The user's Windows retest rejected the earlier build's visuals/completeness; there is still no target-PC post-rebuild frame-time measurement. Current acceptance target and seven-scene plan: [REBUILD_PLAN.md](REBUILD_PLAN.md).

**Target goals, NOT achieved claims:** 60+ FPS at native 2560×1440 on user's NVIDIA RTX 5060 Ti (8 GB), Intel i5-13400 and 16 GB RAM; 144 FPS where practical. The target machine is not connected. No GPU desktop is available in this local sandbox: SDL3 configured dummy/offscreen and `SDL_OPENGL=OFF`; a local graphical launch failed cleanly. Ubuntu CI **did** render three 1280×720 stills under Mesa/Xvfb software OpenGL, but it recorded no gameplay FPS, frame times, RAM/VRAM or target-PC performance. **Actual native-1440p FPS/frame times/RAM/VRAM on target hardware were not measured.**

## CPU-only baseline (not game FPS)

One Debug build run, Linux x86_64 sandbox, Intel Xeon @ 2.60 GHz **2 vCPU**, `build/native/aislopcraft --benchmark` (sequential, one chunk per row, no warmup; times fluctuate). Rows use different seeds/coordinates; they are *not* the 7 complete rendered 1440p scenes:

| CPU workload | generation + local lighting (ms) | meshing 16 sections (ms) | vertices |
|---|---:|---:|---:|
| outdoor | 25.00 | 38.31 | 34,428 |
| mixed biomes | 24.10 | 35.95 | 32,070 |
| fast/new chunk | 24.57 | 38.65 | 33,456 |
| cave | 21.42 | 35.05 | 31,560 |
| water/glass approximation | 26.58 | 58.96 | 38,712 |
| populated mobs | **UNIMPLEMENTED** | — | — |
| flat save/reload | 8.64 | 4.37 | 3,456 |

These are small **CPU workloads only** on a headless sandbox; report neither 60 nor 144 FPS from them. The `--benchmark` command labels them accordingly, including skipped mob scene. Profiling has **not** yet identified CPU/GPU bottlenecks on a real PC.

### Follow-up roofed-forest geometry check (single runs, not FPS)

A Release GCC sandbox comparison on the **same seed 7137331 and first 25 nearby chunks** installed all chunks and then meshed their dirty sections once; it included neither a window nor GPU uploads:

| Code | Generate+install all 25 | Slowest one install+relight | CPU mesh all dirty sections | Solid / cutout / blended vertices | Empty / nonempty sections |
|---|---:|---:|---:|---:|---:|
| Pre-fix `4d4f0f2` | 216 ms | 7.7 ms | 117 ms | 189,594 / 30,054 / 69,618 | 303 / 97 |
| This branch (one local run) | 185 ms | 6.3 ms | 89 ms | 195,960 / 100,512 / 0 | 303 / 97 |

There is normal timing variation; **do not treat those times as speedup or Windows FPS**. The relevant invariant is that 303/400 dirty sections contain no blocks: the frame upload budget previously spent two slots per frame on them; it now clears air immediately without allocating VBOs. Fancy leaves moved from sorted blended geometry to binary cutout/depth writes, and visible sections use conservative view-cone culling. Chunk installation still rebuilds 3×3 lighting synchronously, so occasional hitches are possible. The live F3 overlay now reports GPU renderer/version, FPS and averaged CPU tick/stream/mesh/draw/swap and worst-frame milliseconds. Neither that counter nor a one-frame screenshot replaces a native-1440p frame-time/VRAM benchmark.

## Native-1440p benchmark to implement and run on user's hardware

At 2560×1440, same FOV (70), fixed render distance, day/time, smooth lighting, clouds/transparent blocks enabled, VSync **off for measurement**, resolution scale 100%, fixed seed and camera path, ≥3 repetitions with warmup and cold-load runs separately:

1. Outdoor terrain. 2. Dense forest/multiple biomes. 3. Rapid exploration into new chunks. 4. Lit cave. 5. Water/glass/particles. 6. Mob-populated field. 7. Developed world save/reload.

Record GPU name/driver, CPU/OS, RAM, render distance, settings, resolution, FPS mean/1%-low, p50/p95/p99/p99.9 frame time, worst stalls, RAM/VRAM peaks, worker queue lengths and upload budgets. Use GPU timer queries and CPU sampling to identify bottleneck before optimisation. **Do not** lower resolution or suppress features for a favorable result. Until mobs/particles/saving/container persistence and GPU startup are implemented/tested, there is no complete 7-scene benchmark to report.
