API & Data Contracts
Stable WebSocket messages and ownership boundaries
Baseline architecture v1.0 | 26 October 2026 | 3-member team
Versioned interface contract — freeze on day 1
Endpoint: ws://localhost:8000/ws/v1/simulation. Same socket is used for commands and server events. Connection begins with welcome, followed by a full snapshot. JSON is validated server-side; TypeScript interfaces mirror the schema. Never rename fields without a version bump.
Event routing: state (full snapshot), decision_trace (sort operations or priority decisions), ack, error. A state message is authoritative. Trace events are supporting evidence and may be replayed on the controller page without mutating state.
Frontend holds latest full snapshot in a single store/context. Both pages subscribe to that store. Animation lerps between vehicle path_progress values; reconnect discards old run_id snapshots. Ignore out-of-order sequence numbers.
Only one controller run exists at a time. Assign request_id to every command. Invalid command gives error and leaves engine unchanged.
Frozen sample full state
{"protocol_version":"1.0","kind":"state","run_id":"run-1","sequence_number":28,"tick":14,"sim_status":"running","scenario":"east_surge","seed":42,"controller_mode":"adaptive","speed":1,"phase":"GREEN","phase_remaining":5,"active_direction":"E","queue_order":["E","W","S","N"],"direction_states":[{"direction":"N","queue_count":5,"max_wait_ticks":2,"priority_score":11,"congestion_flag":false,"downstream_free_slots":null}],"vehicles":[{"id":1,"direction":"N","status":"QUEUED","arrival_tick":0,"path_progress":0,"queue_position":0}],"metrics":{"arrived":20,"departed":4,"mean_wait_ticks":3.5,"max_wait_ticks":9,"switches":2,"fairness_overrides":0},"decisions":[]}
For actual messages direction_states must have all four directions, and vehicles contains all active QUEUED or CROSSING vehicles. Sample intentionally abbreviates the array for readability.
Commands and lifecycle
Setup commands are legal only when paused or stopped; reset constructs a fresh RNG and clears IDs, queues, metrics and decision traces. start changes status to running; pause freezes the simulation tick; step advances exactly one second when paused.
After any valid command, server sends ack(request_id) and a new state; server also publishes state at approximately 2 Hz during running. Decisions are emitted with monotonic event IDs.
If WebSocket drops, frontend shows disconnected and reconnects with backoff. During disconnection it stops interpolating beyond last acknowledged state; it never runs local traffic physics.
Boundary contracts for parallel development
Person A owns backend DTOs, JSON Schema, API and simulation internals. Person B consumes the schema in the 3D scene and owns render logic but cannot alter DTO names. Person C consumes the same schema and owns controller visualization + benchmarks/test harness.
Team commits docs/contracts/simulation.schema.json and frontend/src/types/simulation.ts as the frozen integration surface. If any contract field must change, create an ADR and get unanimous approval.
Sources and design evidence
FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
React Three Fiber: https://r3f.docs.pmnd.rs/
Vite: https://vite.dev/guide/
Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh
FHWA Signal Timing Manual: https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm
SUMO documentation: https://sumo.dlr.de/docs/SUMO_at_a_Glance.html
Python random reproducibility: https://docs.python.org/3/library/random.html
pytest: https://docs.pytest.org/en/stable/