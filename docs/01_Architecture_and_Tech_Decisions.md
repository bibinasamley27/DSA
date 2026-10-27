Architecture & Technology Decisions
Fixed, research-backed implementation baseline
Baseline architecture v1.0 | 26 October 2026 | 3-member team
Decision summary
Build one four-way intersection as a deterministic Python traffic simulation, visualized by two React pages: a 3D intersection and a DSA controller dashboard. Python is the only source of simulation truth. Both pages subscribe to the same versioned state stream.
MVP: custom traffic linked list; custom circular linked queue; custom Bubble Sort; congestion-triggered reordering; waiting-time fairness; switching hysteresis; random seeded arrivals; traffic phase safety; animation; comparisons to fixed-cycle baseline. Spillback is Phase 2 and must not delay MVP.
Freeze interfaces and units before coding: 1 tick = 1 simulation second; one inbound straight-through lane per compass direction; one active green approach at a time; no pedestrian, turns, or multiplayer support. Any change to this baseline requires an agreed architecture decision record.
Research-informed technology decisions
Frontend: React 19 + TypeScript + Vite; Three.js through @react-three/fiber v9; CSS modules. React Three Fiber supports reuse of declarative React components for Three.js and its documentation pairs v9 with React 19. Vite provides a fast development server and TypeScript-friendly templates. Prefer this to raw Three.js plus ad hoc DOM wiring for the two coordinated views.
Backend: Python 3.12 + FastAPI + Uvicorn + Pydantic + pytest. Python suits explicit educational DSA implementations. FastAPI supports WebSocket endpoints and disconnection handling. Prefer it to Flask plus additional Socket.IO dependencies for this minimal protocol.
No database or Redis for MVP: one in-memory simulation session owned by one Python process. Avoid pretending this can support multiple independent clients or multi-worker hosting without design changes. Store preset config and benchmark reports as local JSON; test reproducibility with an explicit random seed.
No SUMO: SUMO is an established microscopic traffic simulator, but its modelling and integration complexity would obscure the custom DSA algorithms required by the assignment. Keep cars as visual tokens on predetermined paths.
No physics engine: fixed stop lines, headways, paths and crossing occupancy are easier to test and are sufficient for a signal-control microproject. Three.js InstancedMesh is an optional optimization if many identical cars need rendering; begin with ordinary meshes.
Frozen architecture rules
Backend is authoritative for vehicle IDs, arrivals, queues, departures, waiting time, signal phase, decision events, scores, metrics, and active scheduling order. Frontend computes only presentation coordinates and interpolated visual motion.
Exactly one engine advances on a single asyncio task. Commands are serialized; no direct mutation from WebSocket handlers. State is broadcast as a complete snapshot on a fixed cadence; sort trace events are included as immutable decision logs.
Backend modules: models.py (types and DTOs), structures.py (list/queue/sort), arrivals.py, controller.py, engine.py, metrics.py, scenarios.py, api.py. Frontend modules: transport, shared state and types, Scene page, Controller page.
Simulation units: ticks/seconds. Counts are integers; wait is integer ticks; score is dimensionless. A phase is GREEN → YELLOW → ALL_RED → next GREEN. Nominal simulation phase durations are demo parameters, NOT traffic-safety recommendations.
Each queued vehicle has a unique ID and arrival_tick; average wait uses the time from arrival until crossing start. One visual crossing path per approach. The backend issues vehicle status and progress, the frontend interpolates visuals.
Base signal cycle is N,E,S,W. At planning boundary, compute score = 2*queue_count + 0.5*max_wait_ticks. Eligible queue scores are ranked by the custom Bubble Sort descending, tie broken by the previous circular order. Stability requires a candidate improvement of ≥3 score points for 2 consecutive planning boundaries, except maximum-wait override.
Fairness override: any nonempty direction with max_wait_ticks ≥ 30 must appear at the head of the next plan; deterministic tie break oldest wait then base order. Empty approaches cannot win. Plans are four-position permutations, not perpetual rescheduling each tick; remaining scheduled approaches complete without starvation.
Apply a new order only at the end of the current phase and clearance, and never give simultaneous greens. The current served direction is not immediately served again inside its current round. Empty roads may be skipped while retaining their position in the canonical sequence.
Phase 2 spillback: each outbound link has capacity 20 and occupancy; movement into a full downstream link is blocked; risk affects scores but cannot override phase safety or fairness policy. Clearly mark this an approximation of downstream blocking.
Risk controls
Interface drift: commit JSON Schema + TypeScript matching types on day 1; breaking changes require all three approvals.
3D scope creep: simple cars and one fixed camera before cosmetic work. Provide 2D fallback/low-quality mode if 3D devices struggle.
Algorithm credibility: ban built-in sort for priorities and deque/list replacement for required custom queue/list; test and log every sort comparison.
Reproducibility: all random arrivals sourced from one seeded Python RNG, not Math.random() in the frontend.
Fair comparison: benchmark the baseline and adaptive controller against identical pre-generated arrival schedules, keeping fixed signal durations and service capacity identical.
Sources and design evidence
FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
React Three Fiber: https://r3f.docs.pmnd.rs/
Vite: https://vite.dev/guide/
Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh
FHWA Signal Timing Manual: https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm
SUMO documentation: https://sumo.dlr.de/docs/SUMO_at_a_Glance.html
Python random reproducibility: https://docs.python.org/3/library/random.html
pytest: https://docs.pytest.org/en/stable/