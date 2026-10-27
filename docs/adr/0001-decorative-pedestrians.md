# ADR 0001: Decorative pedestrians in the 3D scene

- Status: accepted (integration lead decision, 2026-10-27); team informed via the PR that adds this record
- Scope: frontend presentation only (Person B). No change to the simulation, metrics, or WebSocket schema v1.0.

## Context

The PRD and Architecture doc 01 list pedestrians as a non-goal: the Python engine models no pedestrians and no
pedestrian phases. The 3D scene (`frontend/src/lib/pedestrians.ts`, `frontend/src/scene/Pedestrians.tsx`) shows
people on sidewalks and crosswalks to make the demo readable as a street scene.

## Decision

Keep the pedestrians as **decorative scenery**, under these constraints:

1. The backend remains the only simulation authority. Pedestrians are not simulated, not counted, and never sent
   to the server; they cannot delay, block, or otherwise influence vehicles, signals, metrics, or benchmarks.
2. They only **read** authoritative state. A pedestrian enters a crosswalk only while the perpendicular road is
   `GREEN` and `phase_remaining` covers the whole crossing (`CROSS_TICKS`), so they never contradict a signal.
3. They follow the presentation clock (`SimClock`): frozen when paused or disconnected, reset on a new run.
4. Verified by `frontend/src/test/overlap.test.ts`: fixture replays assert no crossing pedestrian is on a crosswalk
   during a conflicting phase or touches a vehicle, and walkers stay on sidewalks.

## Consequences

- This is not a pedestrian model and must not be presented as one in the demo or report.
- Pedestrian signal phases, pedestrian demand, or pedestrian delay metrics would be a real scope change requiring
  a new ADR with Person A (engine/schema) and unanimous team approval.
