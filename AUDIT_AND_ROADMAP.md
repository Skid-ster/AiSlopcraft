# AiSlopcraft audit and improvement plan

**Audit snapshot:** 2026-11-16 · branch `arena/5b9073ad-aislopcraft`

This is a risk-based code review, not a proof that every defect has been found. The game is roughly 15,500 lines across source, server, and tests; this pass combined repository inspection, the existing automated suite, a production build, and dependency-audit checks. Browser/device coverage, live-host verification, and hostile-load testing still need to happen before calling the project production-ready.

## Findings from this pass

### Fixed in the working tree

1. **First-time players lacked an in-game guide and touch gameplay.** Added a keyboard-accessible How to Play dialog on the title and pause menus with a first-day path, desktop/touch controls, performance/save tips, and honest notices about temporary multiplayer rooms. Added touch joystick, drag look, mine/use/jump/sneak, inventory and hotbar controls, pause, multiplayer chat, and an always-available return control for inventory/crafting/furnace/chest panels. Pointer release/cancel, multiple held touches, mode changes, and focus loss are covered by UI/input regression tests. Escape/backdrop dismissal restores focus and paused state.
2. **Multiplayer identity was unnecessarily account-based, with no global online list.** Removed password signup/login/session persistence. Players now claim a case-insensitive unique name for the life of their connection; logout/disconnect releases it. The public live leaderboard lists everyone connected to the service, and room browsing works before claiming a name. Added server and UI tests for conflicts, release/reuse, live-list broadcasts, throttling, public visibility, and name-gated room actions.
3. **A room guest could overwrite or delete another player's active projectile.** The relay accepted `projectile:update` and `projectile:remove` for any UID visible in a room snapshot. A malicious client could therefore change the projectile source/state or remove it, causing inconsistent shared combat. The relay now allows updates/removal only by the original source or the room host, and preserves the original owner when the host relays state. A multiplayer regression test checks that a late joiner cannot take over, mutate, or remove the host's projectile, and that the host can remove it normally.
4. **Development-tool dependency advisories.** `npm audit` reported one high and one moderate advisory through Vite 5/esbuild. Vite was updated to 6.4.6; `npm audit` now reports **zero vulnerabilities**. This was tested with the production build and full test suite.
5. **Production HTTP responses lacked baseline browser security headers.** The combined static/relay server now sends a restrictive self-hosted content-security policy, same-origin frame protection, strict-origin referrer handling, MIME sniffing protection, and a permissions policy. Multiplayer WebSocket, inline UI style updates, and locally generated/imported imagery are explicitly accommodated; response headers are covered by integration tests.

### Open security/reliability risks found

1. **Hosted rate-limit identity still needs deployment-specific verification.** The relay now ignores `X-Forwarded-For` by default and only parses it when `AISLOPCRAFT_TRUST_PROXY_HOPS` is explicitly configured. This prevents a direct client from spoofing a forwarded address by default. On a hosted service, the socket peer may be a shared proxy, which can group many players into one rate-limit bucket. Verify the provider's header chain and ingress restrictions before setting the trusted hop count; this behavior has not been verified against a live Azure or Render deployment.
2. **Online rooms and the live-name list are process memory only.** A restart/deploy clears rooms and releases all names; scaling out without a shared coordinator can produce duplicate names and split lists. This is documented and intentionally temporary; do not claim durable online worlds or cross-instance global presence.
3. **The relay is not authoritative for game simulation.** Clients report movement, edits, vehicles, pickups and other state. Existing checks limit malformed data and obvious remote pickups, but a modified client can still cheat or create divergence. This is a scope/architecture risk, not something fixed by validation alone.
4. **No end-to-end browser/device matrix was run during this audit.** Unit tests use Node/jsdom and cover many mechanics, but do not establish real WebGL behavior, browser storage quotas, keyboard/touch input on devices, or a deployed multiplayer session across independent networks.

## Prioritized plan

### Phase 0 — close security and release blockers

- [x] Prevent projectile UID takeover/removal by unrelated room members; add regression coverage.
- [x] Update Vite to a patched compatible major and verify `npm audit` is clean.
- [x] Make forwarded-IP parsing opt-in, validate IP values, count configured trusted proxy hops from the right, and test spoofed/invalid chains.
- [ ] Verify the real proxy chain and ingress restrictions for the chosen host before setting `AISLOPCRAFT_TRUST_PROXY_HOPS` in production.
- [ ] Review every relay message against an authority matrix: who may create, mutate, remove, and grant each entity/state; add adversarial tests for ownership and duplicate IDs.
- [x] Add production CSP, same-origin framing, referrer, MIME-sniffing, and permissions headers; cover them in static-server integration tests.
- **Exit criteria:** full tests/build/audit pass; known proxy configuration is documented; unauthorized state mutations are rejected by automated tests.

### Phase 1 — real-browser reliability

- [ ] Add browser E2E flows for fresh singleplayer, save/reload/export/import, inventory and crafting, pause/death/recovery, settings, and multiplayer name claim/duplicate/release, live leaderboard, lobby/join/leave.
- [ ] Run Chromium, Firefox, and WebKit smoke tests; include a small-screen/touch case and keyboard-only navigation.
- [ ] Exercise WebGL fallback/context loss, low-memory behavior, resize/fullscreen, tab suspension/resume, and storage-denied/quota-full cases.
- [ ] Add WebSocket reconnect/timeout/slow-client tests and verify a disconnect leaves the UI and world in a consistent state.
- **Exit criteria:** core flows have repeatable browser tests, visible error recovery, and no uncaught console errors on supported browsers.

### Phase 2 — multiplayer correctness and hosting operations

- [ ] Define server-authoritative ownership for player positions, inventory, pickups, combat, vehicles, world edits, and container transactions; migrate incrementally and retain the five-room/five-player caps.
- [ ] Add integration/load tests for five rooms × five players, join snapshots near caps, malformed/oversized traffic, slow clients, duplicate-name races, and server restart behavior.
- [ ] Preserve the chosen temporary-session contract (no accounts or persistent player records). If the service scales beyond one instance, add a shared online-name/room coordinator; do not add permanent profiles unless the product requirements change.
- [ ] Validate deployment from a clean environment: build, health endpoint, secure WebSocket, simultaneous name claims from two clients, live leaderboard updates, room close/restart. Only call hosting live after this has been verified.
- **Exit criteria:** observed hosting behavior matches documented limits and data-loss semantics, with tested recovery steps.

### Phase 3 — gameplay completeness and polish

- [ ] Create a feature checklist tied to the stated Beta 1.7.3-inspired scope; mark exact behavior vs. approximations (AI, redstone, fluids, crafting, resource packs, sounds, world generation).
- [ ] Use property-based or invariant tests for inventories/stack conservation, crafting/smelting, save normalization, world coordinates, and multiplayer state transitions.
- [ ] Profile generation, chunk meshing, lighting, shadow/postprocessing passes, entity counts, and texture imports on representative low/high-end hardware; add budgets and regressions.
- [x] Add a keyboard-accessible How to Play guide with focus management, Escape/backdrop dismissal, and gameplay/save/network guidance.
- [ ] Complete accessibility and real-device checks for contrast, all-screen focus order, readable status/errors, reduced motion, touch target sizing, and physical-device control behavior while retaining the classic visual style.
- **Exit criteria:** published feature matrix is honest about unsupported features; performance and accessibility targets are measured rather than assumed.

## Verification run for this pass

- `npm test` — passed, including How to Play accessibility/focus, touch input lifecycle and panel return, live-player broadcasts/name throttling, projectile authorization, proxy parsing, and production-header regressions.
- `npm run build` — passed on Vite 6.4.6.
- `npm audit` — zero vulnerabilities.
- `git diff --check` — passed.

## Scope note

No finite static review can promise “all bugs.” The immediate aim is to convert confirmed defects into regression tests, rank the remaining risks by impact, and close them in verifiable phases. Hosting, durable multiplayer, and cheat-resistant simulation remain unverified/unimplemented until the corresponding plan items are completed.
