# Production Readiness Implementation Plan

> For agentic workers: execute task by task; use the existing npm suite as the commit gate.

**Goal:** Ship the existing game and Render Blueprint with repeatable release evidence.

**Architecture:** Preserve interfaces, harden the server at dispatch and mutation boundaries, then exercise the built app through real UI. Extract bounded responsibilities after coverage exists.

**Tech Stack:** Node 22, Vite, Three.js, ws, jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-production-readiness-design.md`

## Global Constraints

Node `>=22 <23`; Classic-only 5×5 multiplayer; no accounts, Mojang assets, durable rooms, simulation rewrite, weaker HTTP protections, or Pages dependency on Node at runtime.

## Review Focus

- Windows denial skips only the unavailable symlink fixture (task 1).
- Entity identifiers and role flags do not grant rights (task 2).
- Losing WebGL or quota preserves access to menus and exports (task 4).
- An unavailable Render service is not reported as live (tasks 3 and 7).
- Software-rendered browser FPS is not presented as hardware performance (task 6).

## Tasks

1. **Portability:** run `npm ci` and reproduce the fixture failure on Node 22; in `tests/multiplayer.test.mjs` gate just the symlink assertion on Windows `EPERM` with a visible message. Document the Node range and Windows caveat. Run `npm test`; commit.
2. **Relay:** pin permissions, duplicate behavior, pickup proximity and envelope limits with defensive policy tests; wire checks into `server/multiplayer.js` before mutation. Document all message types and who issues them in `docs/relay-authority.md`; run `npm test`; commit.
3. **Hygiene/Render:** add reserved-rights scope and accurate upstream notice, point Blueprint at `npm start`, document Render smoke and prepare GitHub metadata. Verify build and production smoke; commit.
4. **Browser:** add `playwright.config.mjs` and `tests/e2e/` with built-server desktop and touch coverage. Pin save and renderer recovery with failing browser checks before product changes. Wire `npm run verify` and Chromium installation in CI; keep Windows Node tests separate. Run the release gate; commit logical changes separately.
5. **Extraction:** characterize input lifecycle, local saves and seeded world loading; move one bounded responsibility per commit. Run `npm test` after each, and browser checks after integration.
6. **Performance:** record worldgen, mesh, lighting and frame/render-pass measurements for low/high view distances; choose a broad smoke limit and report the reference renderer, scene, and sample sizes. Verify the smoke; commit.
7. **Release:** update README and roadmap from measured evidence. Re-run the clean Node 22 release gate, Windows tests and smoke; prepare the PR summary, leaving live proxy, durable rooms and authoritative gameplay open.
