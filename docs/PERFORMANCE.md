# Performance evidence and benchmark methodology

**Target goals, NOT achieved claims:** 60+ FPS at native 2560×1440 on user's NVIDIA RTX 5060 Ti (8 GB), Intel i5-13400 and 16 GB RAM; 144 FPS where practical. The target machine is not connected. No GPU desktop is available in this sandbox: SDL3 configured dummy/offscreen and `SDL_OPENGL=OFF`, so **actual game FPS/frame times/RAM/VRAM on target hardware were not measured**. A graphical launch failed cleanly with an OpenGL-unsupported error.

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

These are small **CPU workloads only** on a headless sandbox; report neither 60 nor 144 FPS from them. The `--benchmark` command labels them accordingly, including skipped mob scene. Profiling has **not** yet identified CPU/GPU bottlenecks on a real PC. Current code uses one capped background chunk worker, max 20 queued/finished chunks, one installation and two section VBO uploads per frame. Relighting 3×3 chunks synchronously and meshing allocations may cause stutters; measure before redesign.

## Native-1440p benchmark to implement and run on user's hardware

At 2560×1440, same FOV (70), fixed render distance, day/time, smooth lighting, clouds/transparent blocks enabled, VSync **off for measurement**, resolution scale 100%, fixed seed and camera path, ≥3 repetitions with warmup and cold-load runs separately:

1. Outdoor terrain. 2. Dense forest/multiple biomes. 3. Rapid exploration into new chunks. 4. Lit cave. 5. Water/glass/particles. 6. Mob-populated field. 7. Developed world save/reload.

Record GPU name/driver, CPU/OS, RAM, render distance, settings, resolution, FPS mean/1%-low, p50/p95/p99/p99.9 frame time, worst stalls, RAM/VRAM peaks, worker queue lengths and upload budgets. Use GPU timer queries and CPU sampling to identify bottleneck before optimisation. **Do not** lower resolution or suppress features for a favorable result. Until mobs/particles/saving/container persistence and GPU startup are implemented/tested, there is no complete 7-scene benchmark to report.
