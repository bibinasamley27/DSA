# Frontend — 3D simulation page and shared client (Person B)

For measured comparisons in the controller's Benchmarks tab, run
`python -m scripts.benchmark --verify-repeat` from the repository root with the
backend virtual environment active, then load `reports/benchmark.json`. Export
preserves recorded schedules for replay. See `docs/INTEGRATION.md` for the full
workflow and timing configuration.

React 19 + TypeScript + Vite + `@react-three/fiber` v9, CSS Modules. Protocol: WebSocket JSON v1.0
(`../backend/README.md`, `src/types/simulation.ts` is the frozen type file copied unchanged from `backend/fixtures/simulation.ts`).

## Commands
```sh
npm install
npm run dev        # http://localhost:5173 (port is fixed: the backend only allows that origin)
npm test           # vitest
npm run typecheck
npm run build
```

## Data source
- **Live (default):** `ws://localhost:8000/ws/v1/simulation`; override with `VITE_WS_URL`. Start the backend per `backend/README.md`.
- **Mock (explicit only):** open `/?mock=<id>` or pick "Mock: …" in the header. Ids: `east_surge`, `fairness_trap`, `balanced`, `edge_cases`.
  The header shows a **MOCK DATA** badge. A failed live connection never falls back to mock; use Retry.
  Fixtures in `src/fixtures/*.json` are per-tick states recorded from the real Python engine (seed 42, default config);
  only `run_id`/`sequence_number` were renumbered and `sim_status` set to `running` after the first frame.
  `edge_cases` replays out-of-order, obsolete-run, malformed and schema-invalid messages, an error reply, a disconnect/reconnect and a new run.
  In mock mode valid commands get a protocol-shaped `ack` (marked `mock: true`) but the fixture stream is unaffected.

## Shared store (for Person C)
```ts
import { store, useSimState, startConnection } from './net/connection';
const { snapshot, connection, stale, decisions, plan, commands, runEpoch, mode } = useSimState(); // useSyncExternalStore
store.sendCommand({ command: 'step' });   // validated, then sent; result appears in `commands`
```
One `SimStore` + one transport exist for the whole app (`src/net/connection.ts`), independent of which page is mounted, so
navigation never restarts anything. `App` calls `startConnection()` once. Rules enforced in `store.ts`:
state/trace messages with a sequence ≤ the last accepted are dropped; a state with a new `run_id` and a higher sequence starts a new
run (`runEpoch` increments, old run id retired, later messages of it dropped); sequence tracking resets on each new socket;
decision traces pass the same sequence guard as states and advance it; decisions are de-duplicated by `run_id/event_id`
(`decisions`: last 200 of all events; `plan`: last 300 non-ARRIVAL events, so planning traces survive heavy arrival traffic);
snapshots must satisfy the SRS invariants (4 unique directions, `queue_count` = QUEUED vehicles, `arrival_tick <= tick`, no EXITED); acks/errors are matched by `request_id`
(`sent → accepted → applied`, or `rejected` / `timeout` / `not_sent`). On disconnect the last snapshot is kept but `stale` is true and nothing keeps moving.

`src/pages/ControllerPage.tsx` (Person C's page, redesigned in PR #6) renders the DSA controller visualizer at `/controller`:
step-engine rail (commands, lamps, setup, export, metrics) and six sections: traffic linked list, circular signal queue,
Bubble Sort playback, priority breakdown, fairness/stability/spillback, and a decision log; plus Benchmarks and Demo guide tabs.
It uses the same `useSimState()` singleton and `store.sendCommand()`; commands are disabled for mock, stale or pending state.
`lib/sortTrace.ts` rebuilds every Bubble Sort array exactly from `SORT_COMPARE`/`SORT_SWAP` events and `lib/decisionLog.ts`
explains committed orders and greens from emitted events only; both are tested against `backend/fixtures/*.trace.json`,
so regenerating those fixtures after an engine change must keep the tests green.

## Rendering
`src/scene/*` (Road, Junction, Lane, Signal, Vehicle, CameraRig, HUD, Scene). Signals read `phase` + `active_direction` directly
(`lib/signal.ts`). Vehicle placement is `lib/geometry.ts`: `path_progress` 0 = stop line, 0.5 = mid-junction, 1 = far stop line;
queued cars sit `queue_position` slots behind the stop line; right-hand lanes. `lib/interp.ts` lerps between consecutive snapshots over the
measured snapshot interval (120–1200 ms) and holds the last target — no extrapolation, no blending across runs.
The canvas stops rendering while the tab is hidden (no pause command is sent).

`lib/simClock.ts` turns the authoritative `tick` into a smooth presentation clock: it advances only while the server reports `running`,
freezes when paused or stale, is monotonic within a run, and never runs more than one snapshot step ahead.
`test/overlap.test.ts` replays all recorded fixtures at 1 snapshot/tick, live 2 Hz and 4× timing, and asserts that no two cars
intersect at any sampled instant, no crossing pedestrian touches a car or walks during a conflicting phase, and walkers stay on the sidewalks.

- **Signals:** far-side mast arms. Each approach's head hangs over its own lane line across the junction, facing the whole
  queue (lamps on the front face only; tested in `geometry.test.ts`). Crosswalk stripes, a road glow and a lamp halo use the same authoritative colour.
- **World:** main roads extend to ±120 with scenery-only side streets at ±58. Deterministic city blocks (houses with hip roofs,
  shops with awnings, offices, two-tier towers, parks, street lamps; no `Math.random`) are merged per material into ~10 draw calls.
  Textures are canvas-generated (no asset files; works offline). Cars are 2 merged meshes each.
- **Quality:** "High quality" = one 2048² sun shadow map + DPR up to 2; "Low detail" = no shadows, DPR 1.
- **Camera:** diagonal default view; drag to orbit, wheel/pinch to zoom within limits, no pan; "Reset view" restores the default.
- **Overlay UI:** settings panel (left), icon playback buttons (top), simulation time from `tick` (bottom-left), and queue-density /
  longest-wait bar charts from `direction_states` (bottom-right). Per-road vehicle sliders, lane changing, turns and emergency
  vehicles are not in protocol v1.0 and are intentionally absent; there is no speed chart because the protocol carries no vehicle speed.

## Known limitations
- The backend only reports `path_progress` 0 (queued) or 0.5 (crossing) and removes exited vehicles. Motion between
  those states is presentation only (`lib/interp.ts`, `lib/paths.ts`, ADR 0002): arrivals drive in along their approach
  route (North/South straight down the road, East/West off the side street) within a budget that ends before the engine
  can serve them; crossing cars go left, right or straight (decorative, by vehicle id; straight if a crosswalk they would
  cut through is occupied); departed cars drive off to the world edge or onto a side street. Queued cars keep one slot of
  distance in the engine's FIFO order. About 1 in 9 cars uses a supercar skin. Nothing changes counts or metrics.
- **Pedestrians are decorative** (see `docs/adr/0001-decorative-pedestrians.md`). The backend has no pedestrian model (PRD non-goal). Walkers each own a
  sidewalk strip; crossers use a crosswalk only while the perpendicular road is GREEN with `phase_remaining` covering the whole crossing.
  They read signal state and never influence the simulation.
- Seed accepts any safe integer (docs only say "integer"); scenario/seed/mode/speed changes require a paused sim per the backend README, and are disabled otherwise.
- No instancing (not profiled as necessary). Measured: headless Chromium with software GL (SwiftShader) and 50 vehicles ran ~20 fps at 1920×1080 and 55–60 fps at ≤1024 wide; this is not a GPU laptop measurement, the 30 FPS target is **unverified**.
- Bundle is ~2 MB (three.js); not code-split.
- The backend can emit two identical states for one tick; the second is accepted (higher sequence) and is harmless.
