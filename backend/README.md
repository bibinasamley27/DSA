# Python engine and API — protocol v1.0

From the repository root, use Python 3.12:

```sh
cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
pytest -q
uvicorn app.api:app --host 127.0.0.1 --port 8000 --workers 1
```

Health: `GET http://localhost:8000/health`. Socket:
`ws://localhost:8000/ws/v1/simulation`. Development browser origin is
`http://localhost:5173`. Exactly one process owns one shared simulation; commands
affect every connected client. Run one Uvicorn worker.

Each socket gets `welcome`, then a complete `state`. Server envelopes carry
`protocol_version`, `kind`, `run_id`, `sequence_number`, and `tick`. Replies have a
`payload`; state fields are top level, matching the frozen sample. Sequence numbers
increase across all server messages, including resets (gaps per client are valid).
Reset changes run_id; drop old run snapshots. Running state broadcasts occur at
2 Hz; a decision_trace payload contains `decisions` for every tick, including at
4x speed. States carry that tick's decisions. Deduplicate replay by run_id/event_id.
Slow consumers are disconnected so they can reconnect for a full snapshot.

Send commands in this form (flat arguments, no args wrapper):

```json
{"protocol_version":"1.0","kind":"command","request_id":"demo-1","command":"set_scenario","scenario":"east_surge"}
```

Commands: `start`, `pause`, `step`, `reset`, `set_scenario` with `scenario`,
`set_seed` with integer `seed`, `set_speed` with `speed` (0.5, 1, 2, 4), and
`set_controller` with `controller_mode` (`fixed` or `adaptive`). Every valid
command returns `ack` with `payload.request_id`, then broadcasts state to all clients.
Invalid input returns `error` with request ID where available and changes no
simulation data. Extra fields are rejected. Setup commands and reset require a
paused/stopped simulation; step requires paused. Start/pause are idempotent.
Seed/scenario/controller changes restart the run with the new setting; reset
preserves settings and reconstructs RNG, counters and structures. Speed only
changes wall-clock pacing, and requires pause like other setup commands.

Integration handoff: `fixtures/simulation.schema.json`, `commands.schema.json`,
`simulation.ts`, `mock_state.json`, and three `*.trace.json` files. All fields
retain v1.0 names; shared docs and frontend ownership files are untouched. Copy or
consume these artifacts through the team's contract publication process.

## Simulation choices where baseline leaves values unspecified

`Config` defaults: green 8, yellow 2, all-red 1 tick; queue capacity 15 per approach;
congestion threshold 5 queued vehicles. These are configurable demo parameters,
**not traffic safety advice**. One queued vehicle begins crossing per green tick
and finishes one tick later, before the next service. Visual progress is 0 when
queued and 0.5 while crossing; exited vehicles disappear. No overlapping crossing
paths occur. Arrivals are applied before service, and phase counters decrement
at tick end. An arrival can receive immediate service with zero wait.

Planning occurs after an entire four-position round and its last clearance.
Fixed control repeats N,E,S,W. Adaptive control ranks scores `2Q + 0.5W` with a
stable manual Bubble Sort if any queue meets threshold. It commits the same full
candidate only after a >=3 point head improvement at two consecutive round
boundaries. Threshold-triggered sorting is traced before fairness selection. Fairness
(nonempty oldest wait >=30) bypasses hysteresis, ties by
N,E,S,W. All four positions complete before replanning; empty positions keep their
phase slots. The baseline allows empty skipping but does not require it. Under
heavy demand waits can exceed 30 during a round; 30 is an override trigger, not
a hard wait guarantee. Each step logs threshold, comparisons/swaps, rejections,
orders, overrides, arrivals (including rejections), and phase transitions.

`metrics.arrived` counts accepted arrivals; generated and rejected counts are in
benchmark reports without adding fields to the frozen snapshot. Wait metrics use
arrival to crossing start, not current queue age. Direction max_wait_ticks shows
current oldest queued wait. `departed` counts completed crossings.

## Reproduction and comparison

```sh
python export_fixtures.py
python benchmark.py > fixtures/benchmark.json
```

For the integrated controller's Benchmarks tab, run from the **repository root**
with this virtual environment active:

```sh
python -m scripts.benchmark --verify-repeat
python -m scripts.benchmark --replay reports/benchmark.json --verify-repeat --output reports/benchmark-replay.json
```

Load `reports/benchmark.json` using the dashboard's **Load report** button. This
report includes actual measured rows, the full timing/capacity configuration,
recorded arrival counts and their SHA-256 hashes. The replay command uses those
exact recorded arrivals. `team_benchmark_adapter.py` delegates to the existing
engine; it does not implement another controller. The earlier flat JSON produced
by `backend/benchmark.py` remains available for scripts that already consume it;
the dashboard uses the report generated by `scripts.benchmark`.

Benchmarks use five seeds per preset, both controllers, identical pre-generated
arrivals, phase durations, capacity and service. Reports include generated,
rejected, completed, mean/p95/worst service-start wait, switches and overrides.
No performance gain is assumed. Traces are 200-tick seed-42 runs with all decisions
and six sample full states. Simulation contents repeat under the same Python
release; UUID run identity and transport sequence are deliberately excluded from
repeatability comparisons. Presets: zero_demand, balanced, east_surge,
fairness_trap, oscillation.

## Emergency pre-emption (ADR 0003)

`spawn_emergency` with `direction` adds an ambulance (`kind: "ambulance"`) to the back of that approach; allowed
while running, one waiting ambulance per approach. Its approach is held green until the ambulance crosses; any other
green is ended and followed by full yellow and all-red first. The cut-short approach then gets its green back.
Waiting ambulances are ordered by a hand-written min-heap (`structures.EmergencyHeap`). Snapshots carry
`preemption` and the metrics `emergencies` / `mean_emergency_wait_ticks`.

Spillback and downstream capacity are optional Phase 2 and are omitted; the
frozen downstream_free_slots field is null. Frontend rendering and browser
integration belong to Persons B/C and cannot be tested before their code exists.

The oscillation preset alternates 24-tick demand bursts following 20 quiet ticks,
tuned to demonstrate hysteresis under the default 44-tick round. Other timing
configurations still run safely but may produce different decision mixes.

Validation: Python 3.12.15; the test suite includes both controller modes for
1,000 ticks per preset, scheduled-versus-RNG repeatability, saved contracts,
phase/count invariants, commands, two WebSocket clients and slow-client handling.
