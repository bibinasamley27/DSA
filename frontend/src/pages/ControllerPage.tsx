import { useState, type FormEvent } from "react";
import { BookOpen, ChartNoAxesCombined, Download, Network, Pause, Play, RotateCcw, SkipForward, Terminal } from "lucide-react";
import { BenchmarkPanel, downloadJson } from "../components/BenchmarkPanel";
import {
  BubbleSortView, CircularQueueView, DecisionLogView, LinkedListView, Panel, PolicyView, PriorityView,
} from "../components/Diagrams";
import { lampFor } from "../lib/signal";
import { CONTROLLERS, SCENARIOS, SPEEDS, type CommandInput } from "../net/commands";
import { store, useSimState } from "../net/connection";
import { DIRECTIONS } from "../net/protocol";
import css from "./ControllerPage.module.css";

type Tab = "controller" | "benchmarks" | "guide";
const TABS: { id: Tab; label: string; sub: string; Icon: typeof Network }[] = [
  { id: "controller", label: "DSA Controller", sub: "SIGNAL_CONTROLLER", Icon: Network },
  { id: "benchmarks", label: "Benchmarks", sub: "FIXED_VS_ADAPTIVE", Icon: ChartNoAxesCombined },
  { id: "guide", label: "Demo guide", sub: "DEMO_STORYBOARD", Icon: BookOpen },
];
const GUIDE: [string, string][] = [
  ["Basic circular operation", "Connect the backend. Select Balanced, seed 42. Start and watch one active approach, then yellow, then all-red clearance in the circular queue."],
  ["Congestion and Bubble Sort", "Pause, reset and choose East Surge. At a round boundary the THRESHOLD check triggers; step through the SORT_COMPARE and SORT_SWAP trace. Playback explains, it does not schedule."],
  ["Fairness rescue", "Use Fairness Trap. Find a nonempty approach waiting at least 30 ticks and the FAIRNESS_OVERRIDE plan entry, then its green after clearance."],
  ["Stability rejection", "Use Oscillation. Find the HYSTERESIS_REJECT plan entry and explain the 3-point gain over 2 consecutive boundaries."],
  ["Measured comparison", "Run the benchmark adapter on five seeds per scenario. Import its JSON under Benchmarks and discuss mean, p95, worst wait and throughput, including regressions."],
  ["Integration and limits", "Run ID, tick and active direction match the 3D scene. Educational single-intersection model with demo timings; no ML, no real-road control. Spillback is optional."],
];
const pretty = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function ControllerPage() {
  const sim = useSimState();
  const state = sim.snapshot;
  const [tab, setTab] = useState<Tab>("controller");
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const source = sim.mode === "mock" ? "fixture" : "live";
  const status = sim.stale ? "Disconnected · stale snapshot" : sim.connection === "open" ? "Connected" : sim.connection;
  const pending = sim.commands.some((c) => c.status === "sent");
  const latest = sim.commands[0];
  const error = sim.error || (latest && ["rejected", "timeout", "not_sent"].includes(latest.status) ? latest.message ?? "" : "");
  // Commands only on a live, connected, settled session (mock fixtures do not execute commands).
  const live = source === "live" && status === "Connected" && !pending && !!state;
  const setup = live && state?.sim_status !== "running";
  const send = (input: CommandInput) => { store.sendCommand(input); };
  const seedText = seedDraft ?? String(state?.seed ?? "");
  const seedValid = seedText.trim() !== "" && Number.isSafeInteger(Number(seedText));
  const applySeed = (e: FormEvent) => {
    e.preventDefault();
    if (setup && seedValid && Number(seedText) !== state?.seed) send({ command: "set_seed", seed: Number(seedText) });
    setSeedDraft(null);
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className={css.app}>
      <header className={css.top}>
        <div className={css.title}>
          <span className={css.titleIcon} aria-hidden="true"><Terminal size={20} /></span>
          <h1>Visualizing <span>{current.sub}</span></h1>
        </div>
        <div className={css.tabs} role="group" aria-label="Controller views">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}><Icon size={15} aria-hidden="true" />{label}</button>
          ))}
        </div>
        <div className={css.chips}>
          <span className={css.chip}><i className={`${css.dot} ${status === "Connected" ? css.dotOk : sim.stale ? css.dotBad : css.dotWarn}`} />{status}</span>
          {state && <span className={css.chip}>tick <b>{String(state.tick).padStart(4, "0")}</b></span>}
          {state && <span className={css.chip}>run <b title={state.run_id}>{state.run_id.slice(0, 8)}</b></span>}
          {state && <span className={css.chip}>seq <b>{state.sequence_number}</b></span>}
          <span className={css.chip}>PROTOCOL <b>1.0</b></span>
        </div>
      </header>

      <div className={css.layout}>
        <aside className={css.rail} aria-label="Simulation controls">
          <div className={css.card}>
            <div className={css.cardHead}>
              <span className={css.label}>Step engine</span>
              <span className={`${css.badge} ${sim.stale ? css.badgeStale : source === "fixture" ? css.badgeMock : css.badgeLive}`}>
                {sim.stale ? "STALE" : source === "fixture" ? "MOCK" : "LIVE"}
              </span>
            </div>
            <div className={css.engine}>
              <button className={`${css.btn} ${css.btnPrimary}`} disabled={!live}
                onClick={() => send({ command: state?.sim_status === "running" ? "pause" : "start" })}>
                {state?.sim_status === "running" ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                {state?.sim_status === "running" ? "Pause" : "Start"}
              </button>
              <button className={css.btn} title="Advance one tick" disabled={!live || state?.sim_status !== "paused"} onClick={() => send({ command: "step" })}>
                <SkipForward size={15} aria-hidden="true" />Step
              </button>
              <button className={css.btn} title="Reset simulation" disabled={!setup} onClick={() => send({ command: "reset" })}>
                <RotateCcw size={15} aria-hidden="true" />Reset
              </button>
            </div>
            <div className={css.lamps} aria-label="Signal state per approach">
              {DIRECTIONS.map((d) => {
                const lamp = lampFor(d, state);
                return <div key={d} className={`${css.lamp} ${lamp ? css[`lamp${lamp}`] : ""}`} aria-label={`${d}: ${lamp ?? "unknown"}`}><i />{d}</div>;
              })}
            </div>
            <div className={css.readout}>
              <span>{state ? <><b>{state.phase.replace("_", " ")}</b> · {state.phase_remaining}s</> : "—"}</span>
              <span>{state ? <b>{state.sim_status.toUpperCase()}</b> : "—"}</span>
            </div>
          </div>

          <div className={css.card}>
            <span className={css.label}>Setup</span>
            <label className={css.field}>
              <span className={css.label}>Scenario</span>
              <select className={css.input} aria-label="Scenario" value={state?.scenario ?? "balanced"} disabled={!setup}
                onChange={(e) => {
                  const scenario = SCENARIOS.find((s) => s === e.target.value);
                  if (scenario) send({ command: "set_scenario", scenario });
                }}>
                {SCENARIOS.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
              </select>
            </label>
            <form className={css.field} onSubmit={applySeed}>
              <span className={css.label}>Random seed</span>
              <div className={css.seedRow}>
                <input className={css.input} aria-label="Random seed" type="number" step={1} value={seedText} disabled={!setup}
                  onChange={(e) => setSeedDraft(e.target.value)} aria-invalid={!seedValid} />
                <button className={css.btn} type="submit" disabled={!setup || !seedValid}>Apply</button>
              </div>
            </form>
            <div className={css.field}>
              <span className={css.label} id="mode-label">Controller</span>
              <div className={css.segment} role="group" aria-labelledby="mode-label">
                {CONTROLLERS.map((m) => (
                  <button key={m} aria-pressed={state?.controller_mode === m} disabled={!setup || state?.controller_mode === m}
                    onClick={() => send({ command: "set_controller", controller_mode: m })}>{m}</button>
                ))}
              </div>
            </div>
            <label className={css.field}>
              <span className={css.label}>Speed</span>
              <select className={css.input} aria-label="Playback speed" disabled={!setup} value={state?.speed ?? 1}
                onChange={(e) => {
                  const speed = SPEEDS.find((s) => s === Number(e.target.value));
                  if (speed !== undefined) send({ command: "set_speed", speed });
                }}>
                {SPEEDS.map((n) => <option key={n} value={n}>{n}× speed</option>)}
              </select>
            </label>
            {source === "fixture" && <p className={css.status}>Mock fixture stream: commands are disabled here.</p>}
          </div>

          <div className={css.card}>
            <span className={css.label}>Last command</span>
            <p className={css.status} role="status">
              {latest ? <><b>{latest.label}</b> · {latest.status.replace("_", " ")}</> : "none sent yet"}
            </p>
            {error && <p role="alert" className={css.error}>{error}</p>}
            <button className={css.btn} disabled={!state}
              onClick={() => downloadJson({ source, snapshot: state, events: sim.decisions, plan: sim.plan }, "controller-snapshot.json")}>
              <Download size={15} aria-hidden="true" />Export snapshot
            </button>
          </div>

          {state && (
            <div className={css.card}>
              <span className={css.label}>Metrics</span>
              <div className={css.metrics}>
                {([
                  ["arrived", state.metrics.arrived], ["departed", state.metrics.departed],
                  ["mean wait", `${state.metrics.mean_wait_ticks.toFixed(1)}s`], ["max wait", `${state.metrics.max_wait_ticks}s`],
                  ["switches", state.metrics.switches], ["overrides", state.metrics.fairness_overrides],
                ] as const).map(([k, v]) => <div key={k} className={css.metric}><span>{k}</span><b>{v}</b></div>)}
              </div>
            </div>
          )}
        </aside>

        <div className={css.content}>
          {tab === "controller" && (state ? (
            <>
              <Panel num="01" title="Traffic linked list" detail="Live DirectionNode values: queued vehicles, oldest wait and congestion.">
                <LinkedListView state={state} />
              </Panel>
              <Panel num="02" title="Circular signal queue" detail="Signal order received from Python; the current approach is highlighted.">
                <CircularQueueView state={state} />
              </Panel>
              <Panel num="03" title="Bubble sort playback" detail="Each comparison and swap from the latest planning boundary, step by step.">
                <BubbleSortView plan={sim.plan} runId={state.run_id} mode={state.controller_mode} />
              </Panel>
              <div className={css.row2}>
                <Panel num="04" title="Priority breakdown" detail="How queue length and waiting time build each score.">
                  <PriorityView state={state} />
                </Panel>
                <Panel num="05" title="Fairness, stability & spillback" detail="Policy guards and their latest outcomes.">
                  <PolicyView state={state} plan={sim.plan} />
                </Panel>
              </div>
              <Panel num="06" title="Decision log" detail="Why each order was committed and why each direction got its green.">
                <DecisionLogView plan={sim.plan} />
              </Panel>
            </>
          ) : (
            <div className={css.waiting}>
              <h2>Waiting for a complete snapshot</h2>
              <p>Start the Python server at localhost:8000, or pick a mock fixture in the data source selector.</p>
              <p>Reconnect uses the shared transport. No local simulation advances.</p>
            </div>
          ))}
          {tab === "benchmarks" && (
            <>
              <h2 className={css.eyebrow}>Controller Comparison</h2>
              <BenchmarkPanel />
            </>
          )}
          {tab === "guide" && (
            <section className={css.panel} aria-labelledby="guide-title">
              <div className={css.panelHeader}><h2 id="guide-title">Project Demonstration</h2></div>
              <div className={css.guide}>
                {GUIDE.map(([title, body], i) => (
                  <div key={title}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div><h3>{title}</h3><p>{body}</p></div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
