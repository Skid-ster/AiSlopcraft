# AiSlopcraft audit and roadmap

**Release-pass snapshot:** 2026-11-24 · v1.0.2 · [PR #30](https://github.com/Skid-ster/AiSlopcraft/pull/30)

AiSlopcraft remains a procedural browser game: Beta survival/creative is local, Classic creative can also use the no-account room relay. There are at most five rooms and five players per room per process. GitHub Pages serves static singleplayer; Render (primary) and Azure can serve the built app plus same-origin `/ws` from one instance. `dist/` is generated, not committed. Node 22 is the only supported major.

## Phase 0 — portability, authority, and release hygiene

- [x] Keep the file-symlink assertion when supported and skip only that assertion on Windows `EPERM`. Synchronize the name-disconnect regression with the server's roster event instead of client socket close. HTTP headers and traversal/symlink defenses remain in place.
- [x] Record the [complete relay authority matrix](docs/relay-authority.md). Harden vehicle/projectile ownership, shared game state, unique snapshot and live drop IDs, and pickup grants. Cover permissions and message size/shape boundaries with isolated policy tests and keep the local WS suite.
- [x] Record the first-party All Rights Reserved decision and document the verified, unresolved upstream PSX license placeholders. No permission change for third-party terms.
- [x] Apply GitHub description, homepage and topics and open [PR #30](https://github.com/Skid-ster/AiSlopcraft/pull/30) with the verified Render URL.

## Phase 1 — browser reliability

- [x] Add Chromium smoke for a fresh Beta world, mining and placement using real keyboard controls, inventory crafting, pause/death/respawn, persisted settings and local/portable saves. Add a small portrait touchscreen case and two separate browser sessions for Classic multiplayer names and lobby flow.
- [x] Exercise WebGL startup failure and simulated real context loss/restoration. Keep the world open on quota failures and allow a JSON backup without a storage write. Handle the browser's rejected pointer-lock requests without an uncaught exception.
- [x] Fix black Classic grass and leaves: the mesher was feeding missing Beta climate fields into vertex tint math. A Node regression checks finite vertex colors and Chromium samples visible grass pixels with both the Classic and PSX presets.
- [x] Wire the browser suite into `npm run verify` and the Linux CI job, with a separate Windows Node/jsdom job. Hosted Actions execution is pending a push, not inferred from local runs.
- [ ] Add Firefox/WebKit and physical-device coverage, keyboard-only accessibility pass, and broader failure testing (low memory, storage access denial, sleep/wake, slow connections and reconnect).

## Phase 2 — deployment and multiplayer limits

- [x] Preserve the single-instance Render Blueprint and `/health`, `npm start`, Azure and static Pages. Keep the production and deployment smoke commands separate: a loopback pass cannot verify hosted HTTPS/WSS.
- [x] Verify the existing [Render service](https://aislopcraft-online.onrender.com/) with the HTTPS/WSS deployment smoke. This predates deployment of the v1.0.2 branch.
- [ ] Repeat the smoke after v1.0.2 deploys. Verify free-plan wake/reconnect, concurrent sessions, close/restart behavior, and the real proxy header chain. Leave `AISLOPCRAFT_TRUST_PROXY_HOPS` unset until ingress and appending behavior are verified. The relay otherwise keys limits by the direct peer, which can be a shared proxy.
- [ ] Broader soak tests for full 5×5 concurrency, large join snapshots and slow clients.
- [ ] Server-authoritative gameplay and durable multiplayer are intentionally out of scope. Reported movement and world edits are not proof of legitimate play. Processes do not share state; names and rooms end on restart, deploy or host departure as applicable. A future authoritative simulation or durable room service would be separate product work.

## Phase 3 — maintainability and performance

- [x] Extract local save storage, seeded world/spawn loading, and touch input in separate regression-tested commits. The remaining UI and main loop still own orchestration; they were not rewritten.
- [x] Add a seeded reference scene, CPU chunk/lighting/mesh budget, and repeatable [frame, shadow, and PSX measurements](docs/performance.md).
- [ ] Repeat the reference profile on lower-end hardware and physical phones. Expand conservation/property tests and audit detailed Beta-era parity without advertising an exact recreation.

## Verification evidence

- Node 22.23.5 on Windows: `npm ci` and `npm run verify` passed (unit/jsdom, build, local production smoke, CPU budget, seven Chromium cases with native GL, and zero audit findings). The OS denied the symlink fixture; only that assertion was skipped.
- `npm run profile:rendering` passed on the Windows reference GPU at both view distances; see the [measurements](docs/performance.md).
- Live `npm run smoke:deploy` passed against `https://aislopcraft-online.onrender.com` for the existing deployment (readiness, limits, HTTPS, WSS, name claim/release, create/list/edit/leave). This does not verify the v1.0.2 rollout or proxy headers.
