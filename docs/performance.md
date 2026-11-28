# Performance budget

**Reference scene:** Classic singleplayer, seed `release-perf`, starting spawn, midday, clouds off, Fancy graphics, 800×600 at 1× pixel density, no game FPS cap. A 2-chunk view meshes 21 chunks; a 12-chunk view meshes the entire finite 256-chunk map.

## Reproduce

```sh
npx playwright install chromium
npm run build
npm run smoke:perf
AISLOPCRAFT_HARDWARE_GL=1 npm run profile:rendering
```

In PowerShell, set `$env:AISLOPCRAFT_HARDWARE_GL='1'` before running the last command. Without native GPU mode the profile uses SwiftShader and reports timings without asserting the hardware FPS floor. The built site and relay run on an ephemeral loopback port. Set `AISLOPCRAFT_PROFILE_SCREENSHOT` to a path prefix to capture the scenes at both view distances.

| Check | Budget | Where enforced |
|---|---|---|
| CPU chunk generation including voxel lighting | p95 < 150 ms per chunk at both distances | `npm run smoke:perf` / CI |
| CPU mesh building | p95 < 100 ms per chunk at both distances | `npm run smoke:perf` / CI |
| Steady frame cadence | ≥ 30 FPS per preset at both distances on the reference GPU | `npm run profile:rendering` with native GL |

The CPU smoke measures seeded generation and decoration, `WorldLighting.addChunk`, and raw mesh construction separately across Classic (`distance=2` and `distance=12`), the 256-block Overworld (`overworld-v1`, 21 chunks), and the 128-block Nether (`nether-v1`, 21 chunks including lava-sea emission and fortress geometry) with the same CPU thresholds. The browser profile (`npm run profile:rendering`) waits for all requested chunks, warms both **Normal** (`classic`) and **Shader** (`shader`) presets for 15 frames, and samples 90 animation intervals plus CPU submission times for world and shadow draws. These per-pass times are **not** GPU timer-query results. The FPS figure is a steady-state sample, not a load-time or a minimum specification for laptops or phones. The CPU thresholds are deliberately loose regression guards, not promises that chunks always finish inside the render loop's 4 ms scheduling window.

## Reference run — 2026-11-24

Windows, Intel i5-13400, RTX 5060 Ti, Node 22.23.5 and Playwright Chromium 159 (ANGLE/D3D11). Milliseconds shown as p95.

| Distance | Generation | Voxel lighting | Generation + lighting | Mesh |
|---:|---:|---:|---:|---:|
| 2 | 2.4 | 30.2 | 31.8 | 25.0 |
| 12 | 2.3 | 55.3 | 56.0 | 15.8 |

| Distance | Preset | FPS | Frame ms | World draw ms | Shadow draw ms | PSX present ms |
|---:|---|---:|---:|---:|---:|---:|
| 2 | Classic | 60.0 | 16.7 | 0.6 | — | — |
| 2 | Cinematic | 60.0 | 16.7 | 0.9 | 0.5 | — |
| 2 | PSX | 60.0 | 16.8 | 0.9 | — | 0.2 |
| 12 | Classic | 60.0 | 16.7 | 2.5 | — | — |
| 12 | Cinematic | 60.0 | 16.7 | 3.2 | 2.8 | — |
| 12 | PSX | 60.0 | 16.7 | 2.8 | — | 0.2 |

Voxel lighting was the largest measured chunk cost; the 21-chunk run includes a colder mesh path, so its p95 should not be read as a render-distance speedup. These measurements establish a baseline, not a performance improvement claim.
