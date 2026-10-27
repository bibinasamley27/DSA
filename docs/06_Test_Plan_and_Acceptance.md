Testing & Acceptance Plan
Verification scenarios, invariants, and benchmark protocol
Baseline architecture v1.0 | 26 October 2026 | 3-member team
Test strategy
Unit-test custom data structures independently with pytest. Use property/invariant tests for circular queue wraparound, no lost node, stable iteration, and Bubble Sort descending/tie handling. Do not use Python sort as implementation; reference sorting is acceptable only in tests.
Simulation tests: zero demand; balanced; East surge; fairness trap; oscillating queues; full downstream capacity; restart determinism; long 1,000-tick run; command validation; reset; pause/step.
Safety invariants: zero simultaneous greens; yellow/all-red between different active greens; count conservation = generated - rejected - departed = queued + crossing; nonnegative waits and counts; exactly one valid queue permutation.
Frontend integration: mock contract fixtures must render both pages; no undefined fields; after WebSocket disconnect, display paused/reconnecting; out-of-order messages ignored; both pages show same active direction and clock.
Benchmark: for each of 5 seeds per preset, pre-generate the same arrivals to compare fixed and adaptive modes. Record arrivals, completed departures, mean and 95th-percentile wait, worst wait, skipped/blocked arrivals, switch count, starvation overrides. Keep duration, service capacity and green timing identical.
No predetermined performance gain is guaranteed. A fair project report includes failure cases and tradeoffs; fairness may improve maximum waiting time at cost of average wait.
Acceptance checklist
A newly cloned repository starts both services following README commands.
Seed 42 East Surge forces a reproducible priority reorder and visible Bubble Sort trace.
Fairness Trap causes overdue approach scheduling after phase clearance.
Oscillating traffic causes at least one hysteresis-rejected reorder.
WebSocket full state satisfies schema and vehicle/count invariants.
The simulation never gives intersecting approaches concurrent green.
Start, pause, step, reset and seed/scenario changes work predictably.
Both pages stay consistent through navigation and connection recovery.
Benchmark JSON export contains actual measured results and baseline comparison.
Demo works from a single laptop with no external services or login.
Demo storyboard
1. Open page 1 in paused mode and explain 4-way geometry.
2. Show page 2 custom linked list, circular queue and Bubble Sort trace.
3. Select East Surge, seed 42, start and explain reorder reasoning.
4. Select Fairness Trap and show oldest waiting direction selected.
5. Select Oscillation and show hysteresis reject.
6. Compare fixed vs adaptive metrics under same pre-generated arrivals; acknowledge tradeoffs and limitations.
Sources and design evidence
FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
React Three Fiber: https://r3f.docs.pmnd.rs/
Vite: https://vite.dev/guide/
Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh
FHWA Signal Timing Manual: https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm
SUMO documentation: https://sumo.dlr.de/docs/SUMO_at_a_Glance.html
Python random reproducibility: https://docs.python.org/3/library/random.html
pytest: https://docs.pytest.org/en/stable/