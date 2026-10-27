// The six controller visualizations. Every value comes from the authoritative snapshot or from events the Python
// engine emitted; nothing here schedules, sorts for real, or predicts the next phase.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Anchor, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ShieldCheck, Timer, Gauge, Waypoints } from "lucide-react";
import type { DecisionEvent, Direction, StateSnapshot } from "../types/simulation";
import { buildLog, type LogItem, type Reason } from "../lib/decisionLog";
import { sortRuns } from "../lib/sortTrace";
import css from "../pages/ControllerPage.module.css";

export const names: Record<Direction, string> = { N: "North", E: "East", S: "South", W: "West" };
const arrow = (o: readonly Direction[]) => o.join(" → ");
const FAIRNESS_WAIT = 30;     // backend controller: nonempty approach waiting >= 30 ticks goes first
const HYSTERESIS_GAIN = 3;    // backend controller: head score must improve by >= 3 ...
const HYSTERESIS_STREAK = 2;  // ... for 2 consecutive boundaries

export function Panel({ num, title, detail, tag, children }: { num: string; title: string; detail: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <section className={css.panel} aria-labelledby={`panel-${num}`}>
      <div className={css.panelHeader}>
        <div className={css.headingGroup}>
          <span className={css.num}>{num}</span>
          <div>
            <h2 id={`panel-${num}`}>{title}</h2>
            <p>{detail}</p>
          </div>
        </div>
        {tag}
      </div>
      {children}
    </section>
  );
}

function phaseTag(state: StateSnapshot) {
  if (state.phase === "GREEN") return { text: `ACTIVE · GREEN ${state.phase_remaining}s`, yellow: false };
  if (state.phase === "YELLOW") return { text: `ACTIVE · YELLOW ${state.phase_remaining}s`, yellow: true };
  return null;
}

/* 01 ------------------------------------------------------------------------------------------- */
export function LinkedListView({ state }: { state: StateSnapshot }) {
  const tag = phaseTag(state);
  return (
    <div className={css.scroller}>
      <div className={css.chain} role="list" aria-label="Traffic linked list, head to null">
        <div className={css.anchor} aria-hidden="true"><span><Anchor size={20} /></span>HEAD</div>
        {state.direction_states.map((d, i) => {
          const active = d.direction === state.active_direction;
          return (
            <div
              key={d.direction}
              role="listitem"
              className={`${css.node} ${i === 0 ? css.nodeFirst : ""} ${active ? (state.phase === "YELLOW" ? css.nodeYellow : css.nodeActive) : ""}`}
              aria-label={`${names[d.direction]}: ${d.queue_count} queued, max wait ${d.max_wait_ticks}s${d.congestion_flag ? ", congested" : ""}`}
            >
              {active && tag && <span className={`${css.tag} ${tag.yellow ? css.tagYellow : ""}`}>{tag.text}</span>}
              <div className={css.nodeTop}><span>IDX {i}</span><b>{d.direction}</b></div>
              <div className={css.nodeBig}>{d.queue_count}</div>
              <div className={css.nodeSub}>
                wait {d.max_wait_ticks}s {d.congestion_flag && <b className={css.congested}>· CONGESTED</b>}
              </div>
              <div className={css.nodeNext}>next → {state.direction_states[i + 1]?.direction ?? "null"}</div>
            </div>
          );
        })}
        <span className={css.null} aria-hidden="true">∅ null</span>
      </div>
      <p className={css.caption}>DirectionNode {"{"} direction, queue, max_wait, next {"}"} · singly linked · traversal O(n) · node value = queued vehicles</p>
    </div>
  );
}

/* 02 ------------------------------------------------------------------------------------------- */
const NODE_W = 118, GAP = 22, ANCHOR_W = 48, PAD = 8;
export function CircularQueueView({ state }: { state: StateSnapshot }) {
  const tag = phaseTag(state);
  // Loop arrow from the tail's top edge back over the row into the head anchor (tail.next = head).
  const headX = PAD + ANCHOR_W / 2;
  const tailX = PAD + ANCHOR_W + GAP + 3 * (NODE_W + GAP) + NODE_W - 16;
  return (
    <div className={css.scroller}>
      <div className={css.chain} role="list" aria-label={`Circular signal queue ${arrow(state.queue_order)}, then back to ${state.queue_order[0]}`}>
        <svg className={css.loop} aria-hidden="true">
          <defs>
            <marker id="loopHead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" fill="#f6a623" />
            </marker>
          </defs>
          <path d={`M${tailX} 52 V22 Q${tailX} 10 ${tailX - 12} 10 H${headX + 12} Q${headX} 10 ${headX} 22 V40`}
            fill="none" stroke="#f6a623" strokeWidth="2" markerEnd="url(#loopHead)" />
          <text x={(headX + tailX) / 2} y="6" fill="#f6a623" fontSize="10" fontFamily="monospace" textAnchor="middle">tail.next = head</text>
        </svg>
        <div className={css.anchor} aria-hidden="true"><span><Anchor size={20} /></span>HEAD</div>
        {state.queue_order.map((d, i) => {
          const active = d === state.active_direction;
          const ds = state.direction_states.find((x) => x.direction === d);
          return (
            <div key={d} role="listitem"
              className={`${css.node} ${i === 0 ? css.nodeFirst : ""} ${active ? (state.phase === "YELLOW" ? css.nodeYellow : css.nodeActive) : ""}`}
              aria-label={`Position ${i}: ${names[d]}${active ? `, current (${state.phase})` : ""}`}>
              {active && tag && <span className={`${css.tag} ${tag.yellow ? css.tagYellow : ""}`}>{tag.text.replace("ACTIVE", "CURRENT")}</span>}
              <div className={css.nodeTop}><span>POS {i}</span><span>{i === 0 ? "head" : i === 3 ? "tail" : ""}</span></div>
              <div className={css.nodeBig}>{d}</div>
              <div className={css.nodeSub}>{names[d]} · {ds?.queue_count ?? 0} queued</div>
            </div>
          );
        })}
      </div>
      <p className={css.caption}>
        {state.phase === "ALL_RED"
          ? <span className={css.clearance}>ALL RED · clearance ({state.phase_remaining}s) · current = null</span>
          : <>current → {state.active_direction} · order from Python; a new order applies only at a round boundary</>}
      </p>
    </div>
  );
}

/* 03 ------------------------------------------------------------------------------------------- */
const CODE = [
  "for end in range(3, 0, -1):",
  "    for i in range(end):",
  "        compare(order[i], order[i+1])",
  "        if score[order[i]] < score[order[i+1]]:",
  "            swap(order[i], order[i+1])",
];
const SLOT = 124;
export function BubbleSortView({ plan, runId, mode }: { plan: DecisionEvent[]; runId: string; mode: StateSnapshot["controller_mode"] }) {
  const runs = useMemo(() => sortRuns(plan).filter((r) => r.complete), [plan]);
  const [pick, setPick] = useState<number | null>(null); // null = follow the latest boundary
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const run = runs[pick ?? runs.length - 1];
  const total = run?.steps.length ?? 0;
  useEffect(() => { setPick(null); setStep(0); setPlaying(false); }, [runId]);
  useEffect(() => { if (pick === null) { setStep(0); setPlaying(false); } }, [run?.tick, pick]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setStep((s) => { if (s >= total - 1) { setPlaying(false); return s; } return s + 1; }), 850);
    return () => clearInterval(id);
  }, [playing, total]);

  if (!run) {
    return <div className={css.empty}>{mode === "fixed"
      ? "Fixed cycle: the controller does not sort. Switch to adaptive to see Bubble Sort traces."
      : "No complete sort trace yet. The engine sorts at a round boundary (every 4 greens) when an approach is congested."}</div>;
  }
  const s = run.steps[Math.min(step, total - 1)]!;
  const sortedFrom = step >= total - 1 ? 0 : s.end + 1; // positions > end are final; all are after the last step
  const line = s.kind === "swap" ? 4 : 2;
  const say = s.kind === "compare"
    ? <>compare <b>{s.left}</b>({s.leftScore}) vs <b>{s.right}</b>({s.rightScore}): {s.leftScore < s.rightScore ? "left is smaller → swap" : "in order → no swap"}</>
    : <>swap <b>{s.left}</b> ↔ <b>{s.right}</b> → [{s.order.join(", ")}]</>;
  return (
    <>
      <div className={css.stepper}>
        <span className={css.label}>Step engine</span>
        <button className={css.btn} onClick={() => { if (step >= total - 1) setStep(0); setPlaying(!playing); }} aria-label={playing ? "Pause sort playback" : "Autoplay sort playback"}>
          {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "PAUSE" : "AUTOPLAY"}
        </button>
        <button className={`${css.btn} ${css.btnPrimary}`} disabled={step === 0} onClick={() => { setPlaying(false); setStep(step - 1); }} aria-label="Previous sort step"><ChevronLeft size={16} /> PREV</button>
        <button className={`${css.btn} ${css.btnPrimary}`} disabled={step >= total - 1} onClick={() => { setPlaying(false); setStep(step + 1); }} aria-label="Next sort step">NEXT <ChevronRight size={16} /></button>
        <button className={css.btn} onClick={() => { setPlaying(false); setStep(0); }} aria-label="Restart sort playback"><RotateCcw size={15} /></button>
        <label className={css.label}>
          Boundary{" "}
          <select className={css.input} style={{ width: "auto", minHeight: 34 }} value={pick ?? runs.length - 1}
            onChange={(e) => { const v = Number(e.target.value); setPick(v === runs.length - 1 ? null : v); setStep(0); setPlaying(false); }}>
            {runs.map((r, i) => <option key={r.tick} value={i}>t={r.tick}{i === runs.length - 1 ? " (latest)" : ""}</option>)}
          </select>
        </label>
        <span className={css.count}>step {Math.min(step + 1, total)}/{total} · {run.swaps} swap{run.swaps === 1 ? "" : "s"}</span>
      </div>
      <div className={css.scroller}>
        <div className={css.sortStage} role="img" aria-label={`Array ${s.order.join(", ")}; ${s.kind} at positions ${s.i} and ${s.i + 1}`}>
          <span className={css.sortPointer} style={{ transform: `translateX(${s.i * SLOT + 44}px)` }}>i</span>
          <span className={css.sortPointer} style={{ transform: `translateX(${(s.i + 1) * SLOT + 36}px)` }}>i+1</span>
          {run.startOrder.map((d) => {
            const pos = s.order.indexOf(d);
            const hot = pos === s.i || pos === s.i + 1;
            return (
              <div key={d}
                className={`${css.sortCard} ${hot ? (s.kind === "swap" ? css.sortSwap : css.sortCompare) : ""} ${pos >= sortedFrom ? css.sortDone : ""}`}
                style={{ transform: `translateX(${pos * SLOT}px)` }}>
                <b>{d}</b><span>score {run.scores[d]}</span><span>idx {pos}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={css.console}>
        <div className={css.consoleHead}><span>&gt;_ SORT_TRACE · t={run.tick}</span><span>end={s.end} i={s.i}</span></div>
        <div className={css.code}>{CODE.map((c, i) => <div key={i} className={i === line ? css.on : undefined}>{c}</div>)}</div>
        <div className={css.say}>{say}</div>
      </div>
      <p className={css.caption}>Rebuilt exactly from the engine&apos;s SORT_COMPARE/SORT_SWAP events · start [{run.startOrder.join(", ")}] → result [{run.finalOrder.join(", ")}] · replay does not change the simulation</p>
    </>
  );
}

/* 04 ------------------------------------------------------------------------------------------- */
export function PriorityView({ state }: { state: StateSnapshot }) {
  const max = Math.max(1, ...state.direction_states.map((d) => Math.max(d.priority_score, 2 * d.queue_count + 0.5 * d.max_wait_ticks)));
  return (
    <>
      <p className={css.formula}>score = <b>2 × queue</b> + <b>0.5 × max_wait</b> · total shown is the server&apos;s priority_score</p>
      <div className={css.bars}>
        {state.direction_states.map((d) => {
          const q = 2 * d.queue_count, w = 0.5 * d.max_wait_ticks;
          return (
            <div key={d.direction} className={css.barRow} aria-label={`${names[d.direction]}: 2×${d.queue_count} + 0.5×${d.max_wait_ticks} = ${d.priority_score}`}>
              <b>{d.direction}</b>
              <div className={css.barTrack}>
                <i className={css.barQ} style={{ width: `${(q / max) * 100}%` }} title={`2 × ${d.queue_count} = ${q}`} />
                <i className={css.barW} style={{ width: `${(w / max) * 100}%` }} title={`0.5 × ${d.max_wait_ticks} = ${w}`} />
              </div>
              <span className={css.barTotal}>{d.priority_score}</span>
            </div>
          );
        })}
      </div>
      <div className={css.legend}><span><i style={{ background: "var(--mint)" }} />2 × queue</span><span><i style={{ background: "var(--amber)" }} />0.5 × max wait</span><span>ties keep the previous order (stable sort)</span></div>
    </>
  );
}

/* 05 ------------------------------------------------------------------------------------------- */
const last = (events: DecisionEvent[], type: DecisionEvent["type"]) => [...events].reverse().find((e) => e.type === type);
export function PolicyView({ state, plan }: { state: StateSnapshot; plan: DecisionEvent[] }) {
  const fairness = last(plan, "FAIRNESS_OVERRIDE");
  const reject = last(plan, "HYSTERESIS_REJECT");
  const threshold = last(plan, "THRESHOLD");
  const commit = last(plan, "ORDER_COMMITTED");
  const slots = state.direction_states.map((d) => d.downstream_free_slots);
  const spillback = slots.some((s) => s !== null);
  const improvement = typeof reject?.data.improvement === "number" ? reject.data.improvement : null;
  const streak = typeof reject?.data.streak === "number" ? reject.data.streak : null;
  return (
    <div className={css.policy}>
      {state.controller_mode === "fixed" && <p className={`${css.caption} ${css.warn}`}>Fixed cycle: congestion, fairness and hysteresis are not applied in this mode.</p>}
      <div className={css.policyBlock}>
        <h3><ShieldCheck size={14} /> Fairness · override at ≥ {FAIRNESS_WAIT}s</h3>
        <div className={css.waitGrid}>
          {state.direction_states.map((d) => {
            const overdue = d.queue_count > 0 && d.max_wait_ticks >= FAIRNESS_WAIT;
            return (
              <div key={d.direction} className={`${css.wait} ${overdue ? css.overdue : ""}`}>
                <span>{d.direction} {d.max_wait_ticks}s {overdue && <b className={css.bad}>!</b>}</span>
                <div className={css.waitTrack}><i style={{ width: `${Math.min(100, (d.max_wait_ticks / FAIRNESS_WAIT) * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
        <p>{fairness ? <>last override t={fairness.tick}: <b className={css.warn}>{fairness.direction}</b> waited {String(fairness.data.wait)}s → moved to head</> : "no override in the buffered history"} · total {state.metrics.fairness_overrides}</p>
      </div>
      <div className={css.policyBlock}>
        <h3><Timer size={14} /> Stability · hysteresis</h3>
        <p>needs head-score gain ≥ {HYSTERESIS_GAIN} on {HYSTERESIS_STREAK} consecutive boundaries</p>
        <p>{reject && improvement !== null && streak !== null
          ? <>last reject t={reject.tick}: gain <b className={improvement >= HYSTERESIS_GAIN ? css.ok : css.bad}>{improvement}</b>/{HYSTERESIS_GAIN} · streak <b className={streak >= HYSTERESIS_STREAK ? css.ok : css.warn}>{streak}</b>/{HYSTERESIS_STREAK}</>
          : "no rejection in the buffered history"}</p>
        <p>{commit && Array.isArray(commit.data.order) ? <>committed t={commit.tick}: {(commit.data.order as Direction[]).join(" → ")}</> : "no commit yet"}</p>
      </div>
      <div className={css.policyBlock}>
        <h3><Gauge size={14} /> Congestion threshold</h3>
        <p>{threshold ? <>last check t={threshold.tick}: <b className={threshold.data.triggered ? css.warn : css.ok}>{threshold.data.triggered ? "triggered → sort" : "not met → keep order"}</b></> : "no threshold check yet"}</p>
        <p>congested now: {state.direction_states.filter((d) => d.congestion_flag).map((d) => d.direction).join(", ") || "none"}</p>
      </div>
      <div className={css.policyBlock}>
        <h3><Waypoints size={14} /> Spillback</h3>
        <p>{spillback
          ? <>downstream free slots: {state.direction_states.map((d) => `${d.direction}=${d.downstream_free_slots ?? "—"}`).join(" ")}</>
          : "not enabled by the engine (optional Phase 2; downstream_free_slots is null)"}</p>
      </div>
    </div>
  );
}

/* 06 ------------------------------------------------------------------------------------------- */
function reasonText(r: Reason): string {
  switch (r.kind) {
    case "fixed": return "fixed cycle: base order, no scoring";
    case "threshold": return r.triggered ? "congestion threshold met → Bubble Sort" : "no approach congested → sort skipped";
    case "sort": return r.run.complete ? `bubble sort: 6 compares, ${r.run.swaps} swap${r.run.swaps === 1 ? "" : "s"} → candidate ${arrow(r.run.finalOrder)}` : "bubble sort trace truncated in the buffer";
    case "fairness": return `fairness override: ${r.direction} waited ${r.wait}s (≥ ${FAIRNESS_WAIT}) → ${r.direction} to the head`;
    case "reject": return `hysteresis rejected ${arrow(r.candidate)}: ${r.improvement < HYSTERESIS_GAIN ? `gain ${r.improvement} < ${HYSTERESIS_GAIN}` : `streak ${r.streak} of ${HYSTERESIS_STREAK} boundaries`}`;
    case "changed": return `candidate accepted: gain ≥ ${HYSTERESIS_GAIN} held for ${HYSTERESIS_STREAK} boundaries`;
    case "kept": return "order unchanged";
  }
}
type Filter = "all" | "plan" | "phase";
export function DecisionLogView({ plan }: { plan: DecisionEvent[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const items = useMemo(() => buildLog(plan), [plan]);
  const shown = items.filter((x) => filter === "all" || (filter === "plan" ? x.type === "boundary" : x.type !== "boundary")).slice(-60).reverse();
  const row = (x: LogItem) => {
    const t = <span className={css.logTick}>t={String(x.tick).padStart(3, "0")}</span>;
    if (x.type === "boundary") {
      return (
        <div key={x.eventId} className={`${css.logItem} ${css.logPlan}`}>
          {t}<b className={`${css.logKind} ${css.ok}`}>PLAN</b>
          <div className={css.logBody}>
            <b>order {arrow(x.order)}</b>
            {x.reasons.map((r, i) => <span key={i}>{reasonText(r)}</span>)}
          </div>
        </div>
      );
    }
    if (x.type === "green") {
      return (
        <div key={x.eventId} className={css.logItem}>
          {t}<b className={`${css.logKind} ${css.ok}`}>GREEN {x.direction}</b>
          <div className={css.logBody}>
            <b>{names[x.direction]} gets the green</b>
            <span>{x.slot !== null && x.order ? `slot ${x.slot} of 4 in the order committed at t=${x.committedAt} (${arrow(x.order)})` : "initial round (before the first buffered commit)"}</span>
          </div>
        </div>
      );
    }
    return (
      <div key={x.eventId} className={css.logItem}>
        {t}<b className={`${css.logKind} ${x.phase === "YELLOW" ? css.warn : css.bad}`}>{x.phase === "YELLOW" ? `YELLOW ${x.direction ?? ""}` : "ALL RED"}</b>
        <div className={css.logBody}><span>{x.phase === "YELLOW" ? "green ends, clearance starts" : "every approach red before the next green"}</span></div>
      </div>
    );
  };
  return (
    <>
      <div className={css.filters} role="group" aria-label="Decision log filter">
        {(["all", "plan", "phase"] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "plan" ? "Planning" : "Phases"}</button>
        ))}
      </div>
      <div className={css.console}>
        <div className={css.consoleHead}><span>&gt;_ DECISION_LOG</span><span>{items.length} entries · newest first</span></div>
        <div className={css.log} aria-live="off">{shown.length ? shown.map(row) : <p className={css.empty}>No decisions yet.</p>}</div>
      </div>
    </>
  );
}
