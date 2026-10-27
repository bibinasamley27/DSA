# Adaptive & Fair 4-Way Traffic Signal Simulator — Team Pack

Read in this order: 01 Architecture, 02 PRD, 03 SRS, 04 API, 05 Work Plan, 06 Tests, then your individual implementation prompt 07.

**Architecture freeze:** single Python simulation authority, one shared WebSocket protocol v1.0, two frontend pages subscribed to same state, fixed one-lane-per-direction straight-through geometry, seeded arrivals, custom DSA implementations. Spillback optional after MVP.

**Four-week parallel schedule:** W1 freeze+scaffolds; W2 DSA+3D+controller; W3 novelty+integration; W4 tests/benchmark/demo.

**Core safety:** green → yellow → all-red → next green; at most one green at a time. This is a teaching simulation, not deployable traffic engineering.

**Sources:**
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [React Three Fiber](https://r3f.docs.pmnd.rs/)
- [Vite](https://vite.dev/guide/)
- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh)
- [FHWA Signal Timing Manual](https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm)
- [SUMO documentation](https://sumo.dlr.de/docs/SUMO_at_a_Glance.html)
- [Python random reproducibility](https://docs.python.org/3/library/random.html)
- [pytest](https://docs.pytest.org/en/stable/)
