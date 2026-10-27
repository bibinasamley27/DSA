# ADR 0002: Decorative turns and road-based arrivals in the 3D scene

- Status: accepted (integration lead decision, 2026-10-28); team informed via the PR that adds this record
- Scope: frontend presentation only (Person B). No change to the engine, metrics, benchmarks or WebSocket schema v1.0.

## Context

The engine models one straight-through lane per approach (doc 01; turns are a PRD non-goal) and sends no destination
for a vehicle. Previously new vehicles appeared just behind their queue slot and departed vehicles always went straight.
The integration lead asked for cars to arrive and leave along the roads, to turn left and right, and for supercars.

## Decision

1. **No invented vehicles.** Every car on screen is a vehicle the server reported, or one that just left (EXITED).
   No background traffic is spawned.
2. **Arrivals drive in along an approach route** (straight down North/South; down the side street and a right turn
   onto East/West). The drive-in for queue position q takes `0.4 + 0.9q` ticks, shorter than the q+1 ticks before
   the engine can serve that car, so a car is always at its slot before it is served.
3. **Turns are decorative.** When a vehicle starts crossing, it goes left, right or straight (deterministic by id),
   and half of departing cars then turn right onto a side street. The engine does not model these movements.
4. **Turns never contradict the signal or pedestrians.** Only one approach is green at a time, so turning paths do
   not meet other approaches' traffic. A turn that would cut through a crosswalk with someone on it becomes
   straight-through, and pedestrians do not step out while a turning car is heading through their crosswalk.
5. **Cars keep their distance.** On each approach a queued car never follows closer than one queue slot to the car
   ahead in the engine's FIFO order, so nobody overtakes or overlaps.
6. **Supercars are a cosmetic skin** on about 1 in 9 simulated vehicles, with the same footprint.

Verified by `frontend/src/test/overlap.test.ts`: all recorded fixtures at 1 snapshot/tick, live 2 Hz and 4x timing,
plus worst cases (every car left / right onto a side street / straight): no car overlaps, no pedestrian contact or
crossing during a conflicting phase, and every car at its slot when the engine reports it crossing.

## Consequences

- The demo and report must say: turns, arrival routes and supercars are visual only; the simulation is straight-through.
- Real turning movements (destinations, turn phases, turn-aware metrics) would be an engine and schema change (v1.1)
  needing Person A and unanimous team approval.
