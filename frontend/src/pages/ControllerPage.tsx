import { useState, type ReactNode } from "react";
import {
  Activity,
  Network,
  Workflow,
  ChartNoAxesCombined,
  BookOpen,
  ArrowUpRight,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Download,
  Radio,
  ChevronRight,
  TrafficCone,
  Layers,
  Link2,
  Clock3,
  Info,
} from "lucide-react";
import { SignalMonitor } from "../components/SignalMonitor";
import { store, useSimState } from "../net/connection";
import { SCENARIOS, type CommandInput } from "../net/commands";
import {
  LinkedListDiagram,
  CircularQueueDiagram,
  PriorityBreakdown,
  BubbleSortPlayback,
  DecisionTimeline,
  MetricsPanel,
} from "../components/Diagrams";
import { BenchmarkPanel, downloadJson } from "../components/BenchmarkPanel";
import css from "./ControllerPage.module.css";
function Panel({
  number,
  title,
  detail,
  children,
  wide = false,
}: {
  number: string;
  title: string;
  detail: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`${css.panel} ${wide ? css.wide : ""}`}>
      <div className={css.panelHeader}>
        <div className={css.headingGroup}>
          <span className={css.sectionNumber}>{number}</span>
          <div>
            <h2>{title}</h2>
            <p>{detail}</p>
          </div>
        </div>
        <span className={css.liveTag}>SNAPSHOT</span>
      </div>
      {children}
    </section>
  );
}
export default function ControllerPage() {
  const sim = useSimState();
  const state = sim.snapshot;
  const events = sim.decisions;
  const source = sim.mode === "mock" ? "fixture" : "live";
  const status = sim.stale
    ? "Disconnected · stale snapshot"
    : sim.connection === "open"
      ? "Connected"
      : sim.connection;
  const pending = sim.commands.filter((c) => c.status === "sent").length;
  const latestCommand = sim.commands[0];
  const error =
    sim.error ||
    (latestCommand?.status === "rejected" ||
    latestCommand?.status === "timeout" ||
    latestCommand?.status === "not_sent"
      ? latestCommand.message
      : "");
  const send = (input: CommandInput) => {
    store.sendCommand(input);
  };
  const [tab, setTab] = useState("controller");
  const live =
    source === "live" && status === "Connected" && !pending && !!state;
  const setup = live && state?.sim_status !== "running";
  return (
    <div className={css.app}>
      <aside className={css.sidebar}>
        <a
          className={css.brand}
          href="#controller"
          onClick={() => setTab("controller")}
        >
          <span className={css.brandIcon}>
            <TrafficCone size={23} />
          </span>
          <span>
            signal<span className={css.brandLight}>lab</span>
            <small>ADAPTIVE TRAFFIC SYSTEM</small>
          </span>
        </a>
        <div className={css.workspace}>
          WORKSPACE <span>v1.0</span>
        </div>
        <nav>
          {(
            [
              ["controller", "DSA Controller", Network],
              ["benchmarks", "Benchmarks", ChartNoAxesCombined],
              ["guide", "Demo guide", BookOpen],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={String(id)}
              className={tab === id ? css.navActive : ""}
              onClick={() => setTab(String(id))}
            >
              <Icon size={18} />
              <span>{String(label)}</span>
              {tab === id && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className={css.sidebarNote}>
          <Layers size={21} />
          <h4>Traffic signal project</h4>
          <p>Queue lengths, signal order and controller decisions.</p>
          <span>
            DSA VISUALIZATION <ArrowUpRight size={12} />
          </span>
        </div>
        <div className={css.sidebarBottom}>
          <span className={css.avatar}>C</span>
          <div>
            Controller & QA<small>Traffic simulation project</small>
          </div>
        </div>
      </aside>
      <div className={css.main}>
        <header className={css.topbar}>
          <div>
            Workspace <ChevronRight size={13} />{" "}
            <b>
              {tab === "controller"
                ? "DSA Controller"
                : tab === "benchmarks"
                  ? "Benchmarks"
                  : "Demo guide"}
            </b>
          </div>
          <div>
            <span className={css.connection}>
              <i className={status === "Connected" ? css.green : css.amber} />
              {status}
            </span>
            <span className={css.topDivider} />
            <span className={css.version}>PROTOCOL 1.0</span>
          </div>
        </header>
        <main className={css.content}>
          <div className={css.pageHeading}>
            <div>
              <span className={css.eyebrow}>
                ADAPTIVE & FAIR · FOUR-WAY INTERSECTION
              </span>
              <h1>
                {tab === "controller" ? (
                  <>
                    Traffic Signal <span>Controller</span>
                  </>
                ) : tab === "benchmarks" ? (
                  <>
                    Controller <span>Comparison</span>
                  </>
                ) : (
                  <>
                    Project <span>Demonstration</span>
                  </>
                )}
              </h1>
              <p>
                {tab === "controller"
                  ? "Queue status, priority scores and signal scheduling."
                  : tab === "benchmarks"
                    ? "Compare fixed-cycle and adaptive control using the same traffic arrivals."
                    : "Steps for presenting the data structures and test results."}
              </p>
            </div>
            <button
              className={css.export}
              disabled={!state}
              onClick={() =>
                downloadJson(
                  { source, snapshot: state, events },
                  "controller-snapshot.json",
                )
              }
            >
              <Download size={15} /> Export snapshot
            </button>
          </div>
          <div className={css.notice}>
            <Info size={16} />
            <span>
              {source === "fixture" ? (
                <>
                  <b>Sample data.</b> Connect the Python server to run the
                  simulation. The examples below are for previewing the
                  dashboard.
                </>
              ) : (
                <>
                  Live mode · one shared session. Commands affect every
                  connected page.
                </>
              )}
            </span>
            <span>
              Use the shared data source selector above for both pages.
            </span>
          </div>
          {error && (
            <p role="alert" className={css.error}>
              {error}
            </p>
          )}
          {tab === "controller" ? (
            <>
              <section className={css.controls}>
                <div className={css.controlFields}>
                  <label>
                    SCENARIO
                    <select
                      aria-label="Scenario"
                      value={state?.scenario ?? "balanced"}
                      disabled={!setup}
                      onChange={(e) =>
                        send({
                          command: "set_scenario",
                          scenario: e.target
                            .value as (typeof SCENARIOS)[number],
                        })
                      }
                    >
                      {SCENARIOS.map((s) => (
                        <option value={s} key={s}>
                          {s
                            .replaceAll("_", " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    RANDOM SEED
                    <input
                      aria-label="Random seed"
                      key={`${state?.run_id}-${state?.seed}`}
                      type="number"
                      defaultValue={state?.seed ?? 42}
                      disabled={!setup}
                      onBlur={(e) => {
                        const seed = Number(e.target.value);
                        if (
                          e.target.value.trim() !== "" &&
                          Number.isSafeInteger(seed) &&
                          seed !== state?.seed
                        )
                          send({ command: "set_seed", seed });
                      }}
                    />
                  </label>
                  <label>
                    CONTROLLER
                    <select
                      aria-label="Controller mode"
                      value={state?.controller_mode ?? "adaptive"}
                      disabled={!setup}
                      onChange={(e) =>
                        send({
                          command: "set_controller",
                          controller_mode: e.target.value as
                            "fixed" | "adaptive",
                        })
                      }
                    >
                      <option value="adaptive">Adaptive</option>
                      <option value="fixed">Fixed cycle</option>
                    </select>
                  </label>
                </div>
                <div className={css.controlButtons}>
                  <select
                    aria-label="Playback speed"
                    disabled={!setup}
                    value={state?.speed ?? 1}
                    onChange={(e) =>
                      send({
                        command: "set_speed",
                        speed: Number(e.target.value) as 0.5 | 1 | 2 | 4,
                      })
                    }
                  >
                    {[0.5, 1, 2, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}× speed
                      </option>
                    ))}
                  </select>
                  <button
                    title="Reset simulation"
                    disabled={!setup}
                    onClick={() => send({ command: "reset" })}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    title="Advance one tick"
                    disabled={!live || state?.sim_status !== "paused"}
                    onClick={() => send({ command: "step" })}
                  >
                    <SkipForward size={16} />
                  </button>
                  <button
                    className={css.primary}
                    disabled={!live}
                    onClick={() =>
                      send({
                        command:
                          state?.sim_status === "running" ? "pause" : "start",
                      })
                    }
                  >
                    {state?.sim_status === "running" ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {state?.sim_status === "running" ? "Pause" : "Start"}
                  </button>
                </div>
              </section>
              {state ? (
                <>
                  <div className={css.runStrip}>
                    <span>
                      <i className={css.green} />
                      {state.sim_status.toUpperCase()}
                    </span>
                    <span>
                      <Clock3 size={13} /> Tick{" "}
                      <b>{String(state.tick).padStart(4, "0")}</b>
                    </span>
                    <span>
                      Run <code>{state.run_id}</code>
                    </span>
                    <span>
                      Sequence <b>{state.sequence_number}</b>
                    </span>
                    <span className={css.runRight}>
                      <Radio size={13} />{" "}
                      {source === "fixture"
                        ? "Recorded mock stream"
                        : "Authoritative snapshot"}
                    </span>
                  </div>
                  <MetricsPanel state={state} />
                  <SignalMonitor state={state} events={events} />
                  <div className={css.grid}>
                    <Panel
                      number="01"
                      title="Traffic linked list"
                      detail="Queue length and waiting time for each direction."
                      wide
                    >
                      <LinkedListDiagram state={state} />
                    </Panel>
                    <Panel
                      number="02"
                      title="Circular signal queue"
                      detail="Current signal and the order of directions in the queue."
                    >
                      <CircularQueueDiagram state={state} />
                    </Panel>
                    <Panel
                      number="03"
                      title="Priority breakdown"
                      detail="How queue length and waiting time contribute to priority."
                    >
                      <PriorityBreakdown state={state} />
                    </Panel>
                    <Panel
                      number="04"
                      title="Bubble sort playback"
                      detail="Step through the comparisons and swaps received from Python."
                    >
                      <BubbleSortPlayback
                        events={events}
                        runId={state.run_id}
                      />
                    </Panel>
                    <Panel
                      number="05"
                      title="Decision timeline"
                      detail="Recent controller events and their explanations."
                    >
                      <DecisionTimeline events={events} />
                    </Panel>
                  </div>
                </>
              ) : (
                <div className={css.waiting}>
                  <Activity size={28} />
                  <h2>Waiting for a complete snapshot</h2>
                  <p>
                    Start Person A's server at localhost:8000, or switch to
                    Fixture preview.
                  </p>
                  <p>
                    Reconnect uses the shared transport. No local simulation
                    advances.
                  </p>
                </div>
              )}
            </>
          ) : tab === "benchmarks" ? (
            <BenchmarkPanel />
          ) : (
            <section className={css.panel}>
              <div className={css.panelHeader}>
                <h2>Evaluator walkthrough</h2>
                <Workflow size={20} />
              </div>
              <div className={css.guide}>
                {[
                  [
                    "Basic circular operation",
                    "Connect the backend. Select Balanced, seed 42. Start and observe one active approach, yellow, then all-red clearance.",
                  ],
                  [
                    "Congestion and Bubble Sort",
                    "Pause, reset and choose East Surge. Follow THRESHOLD, SORT_COMPARE and SORT_SWAP events in the controller. Playback is an explanation, not the scheduler.",
                  ],
                  [
                    "Fairness rescue",
                    "Use Fairness Trap. Look for a nonempty direction waiting at least 30 ticks and the FAIRNESS_OVERRIDE event. Confirm it is served after clearance.",
                  ],
                  [
                    "Stability rejection",
                    "Use Oscillation. Find HYSTERESIS_REJECT and explain the three-point improvement and two-boundary requirement.",
                  ],
                  [
                    "Measured comparison",
                    "Run the benchmark adapter on five seeds per scenario. Import its JSON on the Benchmarks page and discuss mean, p95, worst wait and throughput, including regressions.",
                  ],
                  [
                    "Integration and limits",
                    "Verify run ID, tick and active direction match Person B’s scene. This is an educational single-intersection model with demo timings, no ML and no real-road control. Spillback is optional.",
                  ],
                ].map(([title, body], i) => (
                  <div key={title}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <footer className={css.footer}>
            <span>
              <Link2 size={13} /> Adaptive Traffic Signal Simulator · DSA
              Project
            </span>
            <span>Educational simulation · Person C</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
