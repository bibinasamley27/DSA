# Person C integration boundary

This checkout implements the controller UI and QA tools. The team repository includes Person A’s engine and Person B’s scene; this change integrates the controller with their existing shared frontend client. The standalone app uses labelled, authored fixture data; its trace is illustrative, not proof that an engine ran.

## Frontend integration with Person B and Person A

The team app routes `/` to `SimulationPage` and `/controller` to `ControllerPage` under the existing shared `Shell`. Both subscribe to `useSimState()` from `frontend/src/net/connection.ts`. One process-wide `SimStore` and transport own snapshots, events, ordering, reconnects and command replies. Do not wrap either page in a separate provider or create a second socket.

The controller dashboard sends typed commands through `store.sendCommand()` using the existing `net/commands.ts`. This preserves Person A’s published flat command fields (no `args` wrapper), `payload.request_id` acknowledgement/error matching, and `payload.decisions` trace parsing. Backend schemas and shared DTOs are unchanged. The obsolete Person C prototype socket and protocol copy have been removed; shared transport/protocol tests and controller routing tests cover the integrated path.

The shared header controls live/mock selection for both pages. Recorded mock streams come from `frontend/src/fixtures`; controller commands stay disabled in mock mode. Disconnected snapshots remain visible with an explicit stale label and disabled controls. Setup changes require a paused/stopped server; step requires paused.

Run `cd frontend && npm ci && npm run dev`, then open `http://localhost:5173/controller`. Use the shared mock selector for offline review, or start Person A’s backend using `backend/README.md`. The existing `VITE_WS_URL` setting controls the single shared endpoint.

Joint browser and live-backend acceptance remains required before merge. Automated route tests mock the WebGL canvas, not the snapshot store, page controls or navigation.

## Real benchmark integration

From the repository root, activate the Python 3.12 environment installed using
`backend/requirements.txt`, then run:

```sh
python -m scripts.benchmark --verify-repeat
python -m scripts.benchmark --replay reports/benchmark.json --verify-repeat --output reports/benchmark-replay.json
```

The supplied `team_benchmark_adapter.py` calls the existing backend arrivals,
Engine, Config and Metrics. It converts the generator's per-tick direction tuples
to recorded N/E/S/W counts and converts those exact counts back for replay.
It contains no controller or scoring implementation. Both controllers use the
same arrivals, timing and capacity; repeat verification reruns every measured row.

Defaults come directly from backend Config: green=8, yellow=2, all_red=1,
capacity=15 and congestion_threshold=5. Service is the engine's existing one
vehicle per green tick. Optional `--config config.json` accepts these exact keys
and merges missing values with Config defaults; unknown keys and invalid types
are rejected. Non-default replay runs must use the original `--ticks`, `--seeds`
and `--config` values. Recorded schedule hashes are checked before replay.

The runner writes `reports/benchmark.json` and a concise Markdown results table.
It measures 40 runs (four scenarios, five seeds, two controllers); `--verify-repeat`
doubles engine invocations. These generated reports are ignored by Git. The
measured, small `test-fixtures/benchmark.json` is the committed integration fixture.

Open the controller's Benchmarks tab and load `reports/benchmark.json`. Export
JSON preserves the complete loaded object, including configuration and recorded
schedules. The importer rejects malformed metrics, duplicate controller rows,
unpaired runs and inconsistent schedule hashes. The JSON array in the earlier
`backend/fixtures/benchmark.json` is the original backend runner's format; generate
an integrated report using the command above for this dashboard. No WebSocket
fields or frozen DTOs are changed by the report format.

Waits cover accepted vehicles that have started crossing, including the vehicle
still crossing at the horizon. Departed counts completed crossings. Arrived is
accepted demand; generated equals arrived plus rejected. Unserved waits are
censored, so compare departures, rejections and remaining backlog alongside mean,
p95 and worst served wait. No improvement is guaranteed. A 30-tick fairness
trigger is not a maximum-wait guarantee. The harness unit tests use fake adapters
only to test pairing/tampering; the adapter tests and import fixture use the real
engine.

Run the integration checks from the repository root:

```sh
python -m pytest -c backend/pytest.ini backend/tests tests -q
cd frontend
npm ci
npm test
npm run build
```

## Fixture cases

The shared header selects recorded scene mock streams for offline visualization. The older authored examples in `test-fixtures/state.json`, `fairness.json` and `oscillation.json` are explanatory examples, not evidence that the engine ran. The separate `benchmark.json` fixture is measured and reproducible. Live control always uses the single shared store.
