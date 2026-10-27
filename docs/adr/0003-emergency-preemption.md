# ADR 0003: Emergency vehicle (ambulance) pre-emption

- Status: accepted by the team (2026-10-28); implemented by Ronel (engine and UI)
- Scope: engine behaviour and an additive extension of the WebSocket contract. `protocol_version` stays "1.0":
  no field was renamed or removed, new fields have defaults, and recordings without them still validate.

## Decision

An ambulance is a vehicle with `kind: "ambulance"`, called with the `spawn_emergency` command (`direction`).
It is allowed while running (a live event, not a setup change); at most one waiting ambulance per approach.
It joins the back of its single-lane queue (it cannot pass cars), so "the whole lane goes": the approach is held
green until everything up to and including the ambulance has crossed.

Pre-emption lives in the phase engine and never breaks phase safety:
1. Waiting ambulances are kept in a hand-written binary min-heap keyed by (arrival tick, N/E/S/W order, id).
2. If the ambulance's approach is green, that green is held (never shortened) until the ambulance crosses.
3. Otherwise the current green ends at the end of this tick, then YELLOW and ALL_RED run in full, then the
   ambulance's approach gets green. The circular signal queue and round counter do not advance for this green.
4. When the ambulance has crossed, the pre-emption green ends, and the approach whose green was cut short gets a
   fresh green (`reason: "resume"`). Normal planning (threshold, Bubble Sort, fairness, hysteresis) then continues.
5. Applies in both fixed and adaptive modes. Benchmarks never spawn ambulances, so their results are unchanged.

## Contract additions

- `VehicleState.kind`: `"car" | "ambulance"` (default "car").
- `StateSnapshot.preemption`: `{direction, vehicle_id, since_tick}` for the heap's top ambulance, or null.
- `MetricsState.emergencies` (called) and `mean_emergency_wait_ticks` (arrival to crossing start).
- `DecisionEvent.type`: `EMERGENCY_DETECTED`, `PREEMPT_START`, `PREEMPT_END`; `PHASE_CHANGE.data.reason` is
  `"preempt"` or `"resume"` for those greens. Events emitted by a command appear in the next tick's trace.
- Command: `{"command": "spawn_emergency", "direction": "N" | "E" | "S" | "W"}`.

## Verification

`backend/tests/test_emergency.py`: heap order and removal; validation; the red-approach bound
(1 + yellow + all-red + cars ahead + 1 ticks); held (not shortened) green; resumed green; 1,000-tick runs of all four
scenarios in both modes with ~70 random ambulances: never two greens, ALL_RED always before GREEN and YELLOW before
ALL_RED, vehicle counts conserved; determinism with identical spawns. Without ambulances the engine's decisions are
identical to before (recorded traces unchanged).

Frontend: pedestrians do not start crossing while an ambulance is waiting (a pending pre-emption can cut a green).
`overlap.test.ts` replays a recorded engine run with five ambulances at three delivery timings.
