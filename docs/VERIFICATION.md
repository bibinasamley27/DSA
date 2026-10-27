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
