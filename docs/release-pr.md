# AiSlopcraft v1.0.2 — Render readiness and browser reliability

**Base:** `main` · **Head:** `production-readiness` · [PR #30](https://github.com/Skid-ster/AiSlopcraft/pull/30)

## Summary

- Make the Windows test suite portable without removing symlink protection. Add a relay authority matrix and enforce room/entity permissions and payload boundaries.
- Run the built game in Chromium and exercise Beta gameplay, portable saves, emulated touch, and a separate-browser Classic multiplayer lobby. Keep unsaved progress available when browser storage is full and let WebGL recover without simulating blind.
- Fix black grass and leaves caused by the Classic mesher using Beta-only climate inputs. Verify daylight grass pixels using both the Classic and PSX presets.
- Extract save storage, spawn/load logic, and touch input separately. Add a repeatable CPU and browser performance profile. Preserve the single-instance Render Blueprint, Azure compatibility, and static Pages build.
- Keep first-party rights reserved and preserve the upstream PSX attribution as published.

## Verification

Node 22 on Windows passed the clean install, unit/jsdom suite, production build and smoke, CPU budget, all seven Chromium cases, and dependency audit (zero findings). Details: [roadmap](../AUDIT_AND_ROADMAP.md) and [performance notes](performance.md). GitHub Actions is configured for the Linux release gate and the Windows Node suite. The [existing Render deployment](https://aislopcraft-online.onrender.com/) also passed live smoke, but it is not yet serving the v1.0.2 branch.

## External steps

The repository About section now points to **https://aislopcraft-online.onrender.com/** and lists the voxel, browser-game, sandbox, Three.js, WebGL, and multiplayer topics.

After CI passes and the PR is merged, deploy the merged commit to the existing one-instance Render service and rerun `BASE_URL=https://aislopcraft-online.onrender.com npm run smoke:deploy`. Publish a GitHub release at `v1.0.2` on the merged commit without moving `v1.0.1`. Do not infer a trusted proxy hop count from a successful smoke. Full authority, durable rooms, and live-host proxy/restart checks are not provided by this PR.
