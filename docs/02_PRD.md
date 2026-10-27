Product Requirements Document (PRD)
What we are building, for whom, and how success is judged
Baseline architecture v1.0 | 26 October 2026 | 3-member team
Problem and proposed product
Users: a college DSA evaluator and the three student developers. Problem: a fixed circular signal schedule ignores unequal queue demand, while always prioritizing the longest queue can increase waits for lightly loaded approaches. Deliver an interactive, explainable simulator rather than a deployable road controller.
Product promise: visually connect data structure operations and traffic outcomes in one repeatable, seeded four-way simulation.
Goals and measurable success criteria
Demonstrate actual custom linked list, circular linked queue, and Bubble Sort implementations in running Python code.
Display active traffic-light status and queued cars synchronized between both pages within one broadcast interval.
Show at least one deterministic congestion-triggered reorder, at least one fairness rescue and at least one stability rejection.
In the demo compare 3 seeds per scenario for throughput, mean wait, p95 wait, maximum wait and number of signal switches vs a fixed-cycle baseline. Report measured results even if adaptive is worse.
Complete a reproducible start → pause → step → reset flow without page refresh.
MVP features — must ship
F01 Four-way low-poly junction, incoming queues, per-approach red/yellow/green indicators and one non-conflicting crossing path per approach.
F02 Deterministic seeded arrivals from Uniform Low, Balanced, East Surge and Fairness Trap scenario profiles.
F03 Python-owned linked list of per-direction state, separate circular linked queue for cyclic signal scheduling, and manual Bubble Sort with comparison/swap trace.
F04 Congestion threshold, priority score, hysteresis, fairness override, transition safety and explainable events.
F05 Page 1 3D intersection with play, pause, step, reset, speed, seed, scenario, current mode and counts.
F06 Page 2 DSA view with nodes, score breakdown, queue arrow, bubble-sort trace and decisions.
F07 Fixed-cycle baseline switch for benchmarking, aggregate statistics and JSON export.
Optional later features
P2A Spillback: capacity and downstream occupancy controlled by engine; basic blocking behavior and dashboard indicator.
P2B Dynamic green times and richer animation only after correct MVP; explicitly separate algorithmic novelty from established traffic control techniques.
Non-goals and constraints
No machine learning, maps, camera input, real sensor data, pedestrians, turns, network of intersections, user accounts, cloud persistence, mobile-native apps or realistic driving physics.
All outputs are educational simulation results. Do not present signal timings as real-world engineering settings.
User journeys / demo
User opens simulation, chooses East Surge and seed 42, starts; East queue rises; on a planning boundary, logs show threshold met, candidate order, hysteresis acceptance and eventual East green after clearance.
User opens Controller, sees traffic linked list, score rows, Bubble Sort animation, and circular queue position matching the traffic scene.
User chooses Fairness Trap; lightly loaded South waits long and receives max-wait protection. User resets to fixed baseline on the same seed and compares report.
Sources and design evidence
FastAPI WebSockets: https://fastapi.tiangolo.com/advanced/websockets/
React Three Fiber: https://r3f.docs.pmnd.rs/
Vite: https://vite.dev/guide/
Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh
FHWA Signal Timing Manual: https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm
SUMO documentation: https://sumo.dlr.de/docs/SUMO_at_a_Glance.html
Python random reproducibility: https://docs.python.org/3/library/random.html
pytest: https://docs.pytest.org/en/stable/