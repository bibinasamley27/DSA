# Person C integration boundary

This checkout implements the controller UI and QA tools. The source pack's Person A engine and Person B 3D scene were not supplied. No production scheduling engine has been invented here. The standalone app uses labelled, authored fixture data; its trace is illustrative, not proof that an engine ran.

## Frontend handoff to Person B

Mount `ControllerPage` inside the same `SimulationProvider` that wraps `SimulationPage`. Use `useSimulation()` in either page. Keep one provider above navigation so switching pages does not reconnect or reset. The included shell only contains Person C tabs; no fake 3D page.

`frontend/src/types/simulation.ts` mirrors the supplied v1.0 field names. It is a consumer contract, not a replacement for Person A's authoritative JSON Schema. The original documents include a top-level full snapshot even though one paragraph describes a generic payload envelope; this client follows the full snapshot example.

Live endpoint defaults to `ws://localhost:8000/ws/v1/simulation`; override via `frontend/.env.local` using `.env.example`. Configure Person A's development origin for `http://localhost:5173` and `http://127.0.0.1:5173` as needed.

Commands use `{protocol_version,kind:'command',command,request_id,args?}`. The pack does not freeze argument key names, trace `data` shapes, or the separate `decision_trace` payload structure. This adapter uses:

- `set_scenario`: `args: {scenario: 'east_surge'}`
- `set_seed`: `args: {seed: 42}`
- `set_speed`: `args: {speed: 2}`
- `set_controller`: `args: {controller_mode: 'adaptive'}`
- no args for start/pause/step/reset
- trace envelope: `{protocol_version:'1.0',kind:'decision_trace',run_id,sequence_number,tick,payload:{events:[DecisionEvent]}}`
- optional sort event data: `{left:'N',right:'E',order:['E','N','S','W'],left_score:12,right_score:20}`. `order` describes the state after that recorded operation. If absent, the UI displays the description and explicitly says order is unavailable; it does not compute a guessed swap.

Confirm these unspecified shapes with Person A before integration; adapt only `SimulationStore.tsx`/trace parsing if needed. Snapshot DTO names remain unchanged. `oscillation` appears in Person C and acceptance requirements even though the architecture's initial preset list has only four; the backend must expose it before that acceptance check can pass.

The store validates complete snapshots and queue/vehicle counts; drops same-run stale sequences and retired runs; merges trace IDs; clears the view on reconnect until a fresh complete snapshot arrives. A reconnect establishes a new stream epoch: the server owns which run is current. Events are bounded to 500 in browser memory. Export snapshots to preserve evidence; this is not a durable event archive.

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
