# Integration verification — 27 October 2026

Branch: `feat/benchmark-integration`, based on Bibina's PR #3 commit `97374e0`.
Python: 3.12.15. The following checks passed after connecting the real engine:

- `python -m pytest -c backend/pytest.ini backend/tests tests -q`: **53 passed**.
- `npm test` in frontend: **84 passed**.
- `npm run build` in frontend: strict TypeScript and production Vite build passed.
- `python -m scripts.benchmark --verify-repeat`: 40 actual measured runs,
  four scenarios × five seeds × fixed/adaptive. Every row reproduced on rerun.
- Replaying the recorded schedules with `--verify-repeat` produced an identical
  complete JSON report (40 rows and 20 recorded schedules).
- Eight focused repetitions of the previously intermittent WebSocket test passed
  after the handler cancellation cleanup fix. A separate deterministic test
  verifies cancellation removes the client and drains both connection tasks.

A headless Chromium check exercised the actual app and live Uvicorn backend,
without mocking the store or WebSocket. It verified:

- Live controller render; speed/scenario changes and start/pause/step/reset.
- East Surge at 4× reaches a real planning boundary and delivers comparison and
  swap events to the shared store.
- Simulation/controller navigation preserves the exact paused snapshot and store.
- The scene canvas mounts and its active-direction HUD matches the snapshot.
- Forced socket closure marks the snapshot stale; automatic reconnect receives
  a fresh full state for the same run.
- Importing the full measured report renders all 40 rows; exported JSON retains
  every configuration value, metric, schedule and hash unchanged.

Generated reports: `reports/benchmark.json`, `reports/benchmark.md`, and matching
replay files. These are ignored by Git and reproducible with the documented
commands. `test-fixtures/benchmark.json` is a small committed real-engine pair;
Python tests reproduce its measurements, and frontend tests import/export it.

Limitations: this is a functional browser smoke check, not a target-laptop FPS,
accessibility or visual collision certification. A follow-up settled 3D screenshot
attempt terminated before completion; no claim is made about GPU performance.
Ronel's separately reported shared-client ordering, validation and stale-motion
issues remain outside this branch. Review those fixes before final release.

Warnings: the existing large combined 3D bundle warning and upstream
Starlette/httpx TestClient deprecation warning remain. Scheduling algorithms,
phase durations and frozen WebSocket fields were not changed.

---

# Main after PRs #4, #5, #6 — 27 October 2026

`main` at `9255cdc` (merges #4, #5, #6). Python 3.12.15, pinned `backend/requirements.txt`.

- `python -m pytest -c backend/pytest.ini backend/tests tests -q`: **53 passed**.
- `python -m scripts.benchmark --verify-repeat`, then `--replay ... --verify-repeat`: 40 runs × 1,000 ticks
  (fixed/adaptive on 20 shared schedules); replayed rows and schedules identical.
- Frontend `npm ci`, `npm test`: **108 passed**; `npm run build` passed.
- Fresh `git clone` following `backend/README.md` and `frontend/README.md`: backend 35 passed, frontend 108 passed, build passed.
- Headless Chromium + live Uvicorn (no store/socket mocks):
  - both pages share one run; pause from the controller freezes the scene; backend kill shows "Reconnecting…",
    restart reconnects to the new run, at most one simulation socket open at a time, no page errors;
  - controller at 4×: East Surge seed 42 shows a Bubble Sort trace and a fairness override, Fairness Trap shows
    overrides, Oscillation shows a hysteresis reject; all six controller sections populated;
  - stricter snapshot validation (#5) dropped zero real backend messages over ~140 ticks at 4× in three scenarios;
  - mock `east_surge` renders the controller (sort trace at t=88, MOCK badge, commands disabled);
    mock `edge_cases` drops exactly its injected bad messages (2 malformed, 2 out-of-order, 1 old-run) with no page errors;
  - benchmark report upload/export works; no horizontal overflow at 390 px.
- Ronel's earlier findings (trace sequencing, stale motion, snapshot invariants) are fixed in #5; pedestrians are
  recorded as decorative in `docs/adr/0001-decorative-pedestrians.md`.

Not verified: GPU frame rate on the demo laptop (only software rendering was used), hidden-tab render pausing in a
real browser, and the stale-state vehicle freeze visually (covered by unit tests only).

---

# Arrivals, decorative turns and supercars — 28 October 2026

Branch `feat/scene-arrivals-turns` (ADR 0002). Frontend `npm test`: **120 passed**, typecheck and build passed.
`overlap.test.ts` replays east_surge, fairness_trap and balanced at 1 snapshot/tick, live 2 Hz and 4x timing, plus
worst cases (all left, all right onto a side street, all straight): zero car overlaps (rotated footprints), zero
pedestrian contacts or conflicting-phase crossings, and every car at its slot when the engine reports it crossing.
Live backend smoke (headless Chromium, software rendering): arrivals drive in, turns and supercars render, no page errors.
Not verified: GPU frame rate on the demo laptop.
