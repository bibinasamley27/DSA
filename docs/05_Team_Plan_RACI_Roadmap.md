Three-Person Parallel Work Plan
Ownership, sprint schedule, merge gates and risk controls
Baseline architecture v1.0 | 26 October 2026 | 3-member team
Team ownership and parallel streams
Person A — Python/DSA/backend lead: data structures; arrivals; controller; state machine; FastAPI WebSocket; unit tests for engine; integration adapter; no edits to 3D components.
Person B — 3D/interaction frontend lead: React Three Fiber scene; roads, cars, signals, state interpolation; scene HUD; scenario controls; browser rendering/performance; no edits to backend decision logic.
Person C — Controller/QA/integration lead: controller page; linked list, circular queue and Bubble Sort visualizations; decision explanation; benchmark runs and report export; integration smoke tests; no edits to engine internals without coordination.
Timeline — four weekly sprints, parallel work
Week 1, freeze and scaffold: A publishes schema, Python models and running fake-state WebSocket; B creates typed React/Vite scaffold, fixed 3D junction with mocked snapshot; C creates controller page using same mocked snapshot and creates benchmark test matrix. Gate: both pages render mock data and API contract is signed off.
Week 2, core execution: A implements custom list/queue/sort, seeded arrivals, phase lifecycle; B implements car queues, traffic lights and 3D interpolation; C adds linked-list/circular-queue/sort step views and builds fixed/adaptive comparison runner. Gate: true backend snapshots drive both pages without schema changes.
Week 3, novelty and integration: A implements fairness, hysteresis, congestion triggers and decision events; B polishes animation, scene camera, speed and collision-free paths; C adds decision timeline, fairness/stability explanations and cross-page consistency tests. Gate: seeded congestion and fairness scenarios demonstrably work.
Week 4, verification and demo: A adds optional spillback if time permits and fixes engine defects; B performance and accessibility polish; C runs benchmarks, prepares plots, demo script and documents outcomes. All run integration/regression checks. Gate: release checklist passes and full demo works offline.
Daily parallel workflow
Use GitHub branches feat/backend-*, feat/scene-*, feat/controller-*; protect main. One PR per feature and require at least one review from another person. Merge small chunks every 1–2 days.
Daily 10-minute sync: yesterday, next task, blockers, schema impact. Freeze domain interfaces early; derive UI from fixtures before server readiness. Integration occurs from Week 1, not only at the end.
Ownership: A reviews backend logic; B reviews visual performance; C owns CI, contract tests and release checklist. Any dependency bump across frontend/backend gets documented and tested.
Deliverables per person
A: requirements lock, typed DTOs, custom DS classes, controller engine, deterministic scenarios, WebSocket protocol, engine tests and instructions.
B: 3D scene page, model/path geometry, signal animation, queues, controls, responsive HUD and performance smoke test.
C: DSA page, trace playback, metric cards, comparison benchmark scripts, tests, demo story and final report.
Risk, fallback and decision gates
If the 3D scene runs slowly: cap to 40–60 rendered car meshes, enable low detail and use instancing if proven necessary. If animation still fails, preserve 3D static road + moving colored blocks.
If backend integration stalls: stable mock JSON must allow B and C to finish and test independently; never hardcode new backend assumptions.
If novelty adds complexity: fairness and stability remain MVP, spillback is optional. If needed, disable optional features with config without breaking state schema.
If the team has fewer than four weeks: compress UI polish/optional spillback, not safety tests, contract design or mandatory DSA.
Sources and design evidence
FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
React Three Fiber: https://r3f.docs.pmnd.rs/
Vite: https://vite.dev/guide/
Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh
FHWA Signal Timing Manual: https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm
SUMO documentation: https://sumo.dlr.de/docs/SUMO_at_a_Glance.html
Python random reproducibility: https://docs.python.org/3/library/random.html
pytest: https://docs.pytest.org/en/stable/