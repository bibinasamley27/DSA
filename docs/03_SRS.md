Software Requirements Specification (SRS)
Testable functional, interface, and quality requirements
Baseline architecture v1.0 | 26 October 2026 | 3-member team
System context and interface
Browser web application connects to the single FastAPI/Uvicorn backend at GET /health and WebSocket /ws/v1/simulation. CORS is limited to development origin. The server owns one shared simulation session for the class demo.
JSON messages have protocol_version = "1.0", kind, run_id, sequence_number, tick, payload. On connect server sends welcome and current state. All state snapshots contain one complete, internally consistent tick.
Functional requirements
FR-01: store exactly four DirectionNode entries in a hand-built singly linked list and traverse to read/update counts and wait indicators.
FR-02: implement normal signal scheduling using a hand-built circular linked queue, with tail.next=head and current pointer invariants.
FR-03: run explicit adjacent comparisons and swaps via hand-written Bubble Sort; produce a chronological sort trace.
FR-04: generate vehicle arrivals from a seeded RNG and fixed scenario configuration; clamp queue size to configured capacity and count rejected arrivals when overflow occurs.
FR-05: issue a unique integer ID to each vehicle; update statuses: QUEUED, CROSSING, EXITED; keep visual state aligned with queued count.
FR-06: signals progress through GREEN, YELLOW, ALL_RED; never simultaneously mark two incoming approaches GREEN.
FR-07: congestion threshold triggers candidate evaluation; waiting score and fairness override influence eligible order; hysteresis prevents insignificant frequent order changes.
FR-08: WebSocket accepts set_scenario, set_seed, start, pause, step, reset, set_speed, set_controller commands; server validates args and returns error messages on invalid commands.
FR-09: frontend renders Page 1 traffic scene and Page 2 DSA representations from the same backend snapshot; pages do not duplicate simulation logic.
FR-10: benchmark at least fixed and adaptive controllers on identical arrival schedules; provide metrics and exported JSON report.
FR-11 optional: track downstream occupancy and prevent movement into full links.
Nonfunctional requirements and acceptance targets
NFR-01: deterministic simulation for same seed, scenario, configuration, and controller under the same Python release; hash of tick results identical in repeat runs.
NFR-02: no uncaught exceptions during a 1,000-tick automated run for each preset.
NFR-03: client displays server snapshot in ≤500 ms locally at 2 state broadcasts per second, excluding heavy device GPU rendering; target 30 FPS with ≤60 rendered cars on a typical student laptop.
NFR-04: invalid WebSocket commands do not crash or change the engine; browser reconnect requests a full snapshot.
NFR-05: automated unit tests cover list invariants, queue wraparound, Bubble Sort comparisons, phase safety, fairness, hysteresis and deterministic arrivals.
NFR-06: build and test with one-page setup instructions and frozen dependency lock files; frontend TypeScript no compile errors.
Data contract and event types
StateSnapshot contains protocol_version, kind="state", run_id, sequence_number, tick, sim_status, scenario, seed, controller_mode, speed, phase, phase_remaining, active_direction, direction_states[4], queue_order[4], vehicles[], metrics, decisions[].
DirectionState = direction (N|E|S|W), queue_count, max_wait_ticks, priority_score, congestion_flag, downstream_free_slots(optional). VehicleState = id, direction, status, arrival_tick, path_progress (0..1), queue_position.
DecisionEvent = event_id, tick, type (ARRIVAL|PHASE_CHANGE|THRESHOLD|SORT_COMPARE|SORT_SWAP|HYSTERESIS_REJECT|FAIRNESS_OVERRIDE|ORDER_COMMITTED|SPILLBACK_BLOCK), direction(optional), description, data.
Client commands: {"protocol_version":"1.0","kind":"command","command":"pause","request_id":"abc"}. Replies include kind="ack" or "error"; commands set_controller(fixed|adaptive), set_speed(0.5|1|2|4), set_scenario(preset ID), set_seed(integer), step(one tick).
Snapshot invariants: queue_order always one unique permutation of N,E,S,W; direction count = number of QUEUED vehicles for approach; phase must be green/yellow/all_red; active_direction null during ALL_RED; arrival_tick ≤ tick.
Safety, performance, and out of scope
Only one incoming approach can have a green signal; clearance phases complete even when queued vehicle counts change. This is illustrative traffic control, not a field-deployable design.
One process/one simulation: user actions affect all connected clients. If independent sessions are required later, design a separate session-manager architecture rather than quietly adding one.
No external persistence required; JSON reports only. No personal information collected.
Sources and design evidence
FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
React Three Fiber: https://r3f.docs.pmnd.rs/
Vite: https://vite.dev/guide/
Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh
FHWA Signal Timing Manual: https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm
SUMO documentation: https://sumo.dlr.de/docs/SUMO_at_a_Glance.html
Python random reproducibility: https://docs.python.org/3/library/random.html
pytest: https://docs.pytest.org/en/stable/