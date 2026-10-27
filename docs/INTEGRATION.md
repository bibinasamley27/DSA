# Person C integration boundary

This checkout implements the controller UI and QA tools. The team repository includes Person A’s engine and Person B’s scene; this change integrates the controller with their existing shared frontend client. The standalone app uses labelled, authored fixture data; its trace is illustrative, not proof that an engine ran.

## Frontend integration with Person B and Person A

The team app routes `/` to `SimulationPage` and `/controller` to `ControllerPage` under the existing shared `Shell`. Both subscribe to `useSimState()` from `frontend/src/net/connection.ts`. One process-wide `SimStore` and transport own snapshots, events, ordering, reconnects and command replies. Do not wrap either page in a separate provider or create a second socket.

The controller dashboard sends typed commands through `store.sendCommand()` using the existing `net/commands.ts`. This preserves Person A’s published flat command fields (no `args` wrapper), `payload.request_id` acknowledgement/error matching, and `payload.decisions` trace parsing. Backend schemas and shared DTOs are unchanged. The obsolete Person C prototype socket and protocol copy have been removed; shared transport/protocol tests and controller routing tests cover the integrated path.

The shared header controls live/mock selection for both pages. Recorded mock streams come from `frontend/src/fixtures`; controller commands stay disabled in mock mode. Disconnected snapshots remain visible with an explicit stale label and disabled controls. Setup changes require a paused/stopped server; step requires paused.

Run `cd frontend && npm ci && npm run dev`, then open `http://localhost:5173/controller`. Use the shared mock selector for offline review, or start Person A’s backend using `backend/README.md`. The existing `VITE_WS_URL` setting controls the single shared endpoint.

Joint browser and live-backend acceptance remains required before merge. Automated route tests mock the WebGL canvas, not the snapshot store, page controls or navigation.

## Benchmark adapter supplied by Person A

No engine API or scenario rates were provided. Create an importable module (for example `team_benchmark_adapter.py`) at the repository root exposing these two synchronous functions:

```python
def generate_schedule(*, scenario: str, seed: int, duration_ticks: int) -> list[dict[str, int]]:
    # Call the backend's seeded arrivals generator once.
    # Return exactly duration_ticks records, each {'N': count, 'E': count, 'S': count, 'W': count}.
    ...

def run(*, controller: str, scenario: str, seed: int, duration_ticks: int,
        arrivals: list[dict[str, int]], config: dict) -> dict:
    # Construct a fresh backend engine with the supplied exact arrival schedule.
    # Honor all timing/capacity config values identically for both controllers.
    # Advance exactly duration_ticks. Do not mutate arrivals or config.
    # Compute actual crossing-start waits; p95 uses nearest-rank percentile.
    return {
        'arrived': ..., 'departed': ..., 'mean_wait_ticks': ...,
        'p95_wait_ticks': ..., 'max_wait_ticks': ..., 'switches': ...,
        'rejected_arrivals': ..., 'fairness_overrides': ...,
    }
```

Default demo configuration: green 8 ticks, yellow 2, all-red 1, service capacity 1 per tick, queue capacity 60. These are harness inputs pending agreement with Person A, not frozen backend defaults. Pass `--config path.json` for the backend's actual exposed configuration; unsupported keys should raise an error.

From the repository root:

```sh
python3 -m scripts.benchmark --adapter team_benchmark_adapter --verify-repeat
python3 -m scripts.benchmark --adapter team_benchmark_adapter --replay reports/benchmark.json --verify-repeat
```

The runner makes 40 measured runs (4 scenarios × 5 seeds × 2 controllers), records every arrival schedule with a SHA-256 digest, prevents mutation, checks required finite metrics, and writes JSON plus a Markdown table. Repeat verification doubles engine invocations. Import the JSON into the GUI's Benchmarks tab. Nothing is measured until the real adapter exists. `tests/test_benchmark.py` uses deliberately fake metrics strictly for harness unit testing, never as a project report.

Report limitations: finite horizons censor unfinished waiting vehicles; compare queued backlog and departed count alongside mean/p95. Fairness may trade throughput or average wait for lower worst waits. Arrival and rejected-arrival counting conventions must match the engine.

## Fixture cases

The preview-case selector loads authored static JSON for East Surge, Fairness Rescue and Stability Rejection. It changes neither Python state nor any live control. Use these to develop the visualization independently. Only live events can serve as evidence of actual algorithm execution; fixture decisions and metric values must never be presented as measured outcomes.
