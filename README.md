# Adaptive & Fair 4-Way Traffic Signal Simulator

College DSA project: one Python simulation (manual linked list, circular signal queue, Bubble Sort traces, seeded
arrivals, fairness and hysteresis) shown on two React pages that share one WebSocket state stream (protocol v1.0).
Educational model with demo timings; not real-world traffic engineering.

## Run it (one laptop, no external services)

Backend (Python 3.12), from `backend/`:

```sh
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.api:app --host 127.0.0.1 --port 8000 --workers 1
```

Frontend (Node 22.12+), from `frontend/` in a second terminal:

```sh
npm ci
npm run dev        # http://localhost:5173 (use "localhost"; the backend only allows that origin)
```

Open `/` for the 3D junction and `/controller` for the DSA controller visualizer. Without a backend, open
`http://localhost:5173/?mock=east_surge` (or pick a mock fixture in the header).

## Test and benchmark

```sh
# repository root, with the backend virtualenv active
python -m pytest -c backend/pytest.ini backend/tests tests -q
python -m scripts.benchmark --verify-repeat                      # 40 paired fixed/adaptive runs -> reports/
cd frontend && npm test && npm run build
```

Load `reports/benchmark.json` in the controller's Benchmarks tab for the fixed vs adaptive comparison.

## Documentation

- `docs/README_START_HERE.md`, then docs 01–06 (architecture, PRD, SRS, API contract, team plan, test plan).
- `backend/README.md`: engine, protocol and benchmark details. `frontend/README.md`: shared store, scene, controller.
- `docs/INTEGRATION.md`, `docs/VERIFICATION.md`, `docs/RELEASE_CHECKLIST.md`, `docs/adr/`.

Team: Person A (Gavriel) engine/API · Person B (Ronel) 3D scene and shared frontend transport/state ·
Person C (Bibina) controller dashboard, visualizations, benchmarking/QA.
