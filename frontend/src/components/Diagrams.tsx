import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  GitCompareArrows,
} from "lucide-react";
import type {
  StateSnapshot,
  DecisionEvent,
  Direction,
} from "../types/simulation";
import css from "../pages/ControllerPage.module.css";
export const names: Record<Direction, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};
export function LinkedListDiagram({ state }: { state: StateSnapshot }) {
  return (
    <div className={css.linked}>
      <span className={css.pointer}>head</span>
      <div className={css.nodeRow}>
        {state.direction_states.map((d, i) => (
          <div className={css.nodeGroup} key={d.direction}>
            <div
              className={`${css.node} ${d.direction === state.active_direction ? css.selected : ""}`}
            >
              <div className={css.nodeTitle}>
                <b>{d.direction}</b>
                <span>{names[d.direction]}</span>
                <i className={d.congestion_flag ? css.amber : css.green} />
              </div>
              <div className={css.nodeData}>
                <span>
                  QUEUE <strong>{d.queue_count}</strong>
                </span>
                <span>
                  MAX WAIT{" "}
                  <strong>
                    {d.max_wait_ticks}
                    <small>s</small>
                  </strong>
                </span>
              </div>
              <div className={css.nodeFooter}>
                next{" "}
                <code>
                  {i === 3 ? "null" : state.direction_states[i + 1].direction}
                </code>
              </div>
            </div>
            {i < 3 ? (
              <ArrowRight size={18} />
            ) : (
              <code className={css.null}>∅</code>
            )}
          </div>
        ))}
      </div>
      <p className={css.caption}>
        Four direction nodes · singly linked list · traversal O(n)
      </p>
    </div>
  );
}
export function CircularQueueDiagram({ state }: { state: StateSnapshot }) {
  const positions = [
    [160, 40],
    [260, 130],
    [160, 220],
    [60, 130],
  ];
  return (
    <div className={css.queueLayout}>
      <svg
        viewBox="0 0 320 265"
        role="img"
        aria-label={`Circular queue ${state.queue_order.join(" then ")}, active ${state.active_direction ?? "none"}`}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8295a9" />
          </marker>
        </defs>
        <path
          d="M185 42 Q251 42 260 100 M260 158 Q260 220 190 220 M132 220 Q60 220 60 161 M60 101 Q60 40 128 40"
          fill="none"
          stroke="#a9b6c5"
          strokeWidth="1.6"
          markerEnd="url(#arrow)"
        />
        {state.queue_order.map((d, i) => (
          <g
            key={d}
            transform={`translate(${positions[i][0]},${positions[i][1]})`}
          >
            <circle
              r="27"
              fill={d === state.active_direction ? "#e4f4ec" : "#f7f9fc"}
              stroke={d === state.active_direction ? "#328966" : "#d7dfe8"}
              strokeWidth="2"
            />
            <text
              textAnchor="middle"
              y="6"
              fontSize="18"
              fontWeight="700"
              fill="#24374d"
            >
              {d}
            </text>
            {i === 0 && (
              <text textAnchor="middle" y="-34" fontSize="10" fill="#6d7d90">
                HEAD
              </text>
            )}
            {i === 3 && (
              <text textAnchor="middle" y="44" fontSize="10" fill="#6d7d90">
                TAIL
              </text>
            )}
          </g>
        ))}
        <text x="160" y="124" textAnchor="middle" fontSize="10" fill="#78879a">
          CURRENT
        </text>
        <text
          x="160"
          y="148"
          textAnchor="middle"
          fontSize="24"
          fill="#24374d"
          fontWeight="600"
        >
          {state.active_direction ?? "—"}
        </text>
      </svg>
      <div className={css.queueDetails}>
        <span className={css.pill}>{state.phase.replace("_", " ")}</span>
        <h3>
          {state.active_direction ? names[state.active_direction] : "Clearance"}{" "}
          <small>approach</small>
        </h3>
        <p>{state.phase_remaining}s remaining</p>
        <div className={css.miniCode}>
          tail.next → head
          <br />
          current → {state.active_direction ?? "null"}
        </div>
        <p className={css.caption}>
          Signal order received from Python.
          <br />
          Reorders apply after clearance.
        </p>
      </div>
    </div>
  );
}
export function PriorityBreakdown({ state }: { state: StateSnapshot }) {
  const max = Math.max(
    1,
    ...state.direction_states.map((d) => d.priority_score),
  );
  return (
    <>
      <p className={css.formula}>
        priority = <b>2 × queue</b> + <b>0.5 × max wait</b>
      </p>
      <div className={css.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>APPROACH</th>
              <th>QUEUE × 2</th>
              <th>WAIT × 0.5</th>
              <th>PRIORITY</th>
            </tr>
          </thead>
          <tbody>
            {state.direction_states.map((d) => (
              <tr key={d.direction}>
                <td>
                  <span className={css.directionTag}>{d.direction}</span>
                  {names[d.direction]}
                </td>
                <td>{d.queue_count * 2}</td>
                <td>{d.max_wait_ticks * 0.5}</td>
                <td>
                  <div className={css.score}>
                    <i
                      style={{ width: `${(d.priority_score / max) * 100}%` }}
                    />
                    <b>{d.priority_score}</b>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={css.caption}>
        Stable ties preserve prior order. Nonempty approaches waiting ≥30s
        receive fairness protection.
      </p>
    </>
  );
}
export function BubbleSortPlayback({
  events,
  runId,
}: {
  events: DecisionEvent[];
  runId: string;
}) {
  const trace = events.filter(
    (e) => e.type === "SORT_COMPARE" || e.type === "SORT_SWAP",
  );
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [runId]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setIndex((i) => {
          if (i >= trace.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      900,
    );
    return () => clearInterval(id);
  }, [playing, trace.length]);
  const event = trace[Math.min(index, trace.length - 1)];
  const order = Array.isArray(event?.data.order)
    ? (event.data.order as Direction[])
    : null;
  return (
    <>
      <div className={css.traceIntro}>
        <span className={css.pill}>BUBBLE SORT</span>
        <span>{trace.length} recorded operations</span>
      </div>
      {event ? (
        <>
          <div className={css.sortNodes}>
            {order ? (
              order.map((d) => (
                <div
                  key={d}
                  className={
                    event.data.left === d || event.data.right === d
                      ? css.comparing
                      : ""
                  }
                >
                  {d}
                  <span>
                    {event.data.left === d || event.data.right === d
                      ? "active"
                      : " "}
                  </span>
                </div>
              ))
            ) : (
              <p>Order was not included in this event.</p>
            )}
          </div>
          <div className={css.traceDescription}>
            <GitCompareArrows size={18} />
            <div>
              <b>
                {event.type === "SORT_SWAP"
                  ? "Adjacent swap"
                  : "Adjacent comparison"}
              </b>
              <p>{event.description}</p>
            </div>
          </div>
        </>
      ) : (
        <div className={css.empty}>
          No sort events received. Waiting for an engine planning boundary.
        </div>
      )}
      <div className={css.playback}>
        <div>
          <button
            title="Restart trace"
            onClick={() => {
              setIndex(0);
              setPlaying(false);
            }}
            disabled={!trace.length}
          >
            <RotateCcw size={15} />
          </button>
          <button
            title="Previous operation"
            disabled={!trace.length || index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            title={playing ? "Pause trace" : "Play trace"}
            disabled={!trace.length}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            title="Next operation"
            disabled={!trace.length || index >= trace.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <span>
          Step {trace.length ? Math.min(index + 1, trace.length) : 0} /{" "}
          {trace.length}
        </span>
      </div>
      <p className={css.caption}>
        Replaying these steps does not change the simulation.
      </p>
    </>
  );
}
export function DecisionTimeline({ events }: { events: DecisionEvent[] }) {
  const [filter, setFilter] = useState("all");
  const shown = events
    .filter((e) => filter === "all" || e.type === filter)
    .slice(-30)
    .reverse();
  return (
    <>
      <div className={css.timelineFilter}>
        <label>
          Show events{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All decisions</option>
            {[
              "THRESHOLD",
              "ORDER_COMMITTED",
              "FAIRNESS_OVERRIDE",
              "HYSTERESIS_REJECT",
              "SORT_COMPARE",
              "SORT_SWAP",
              "PHASE_CHANGE",
            ].map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={css.timeline}>
        {shown.length ? (
          shown.map((e) => (
            <div className={css.event} key={e.event_id}>
              <span className={css.eventTick}>
                {String(e.tick).padStart(3, "0")}s
              </span>
              <i
                className={
                  e.type === "HYSTERESIS_REJECT" ? css.amber : css.green
                }
              />
              <div>
                <b>{e.type.replaceAll("_", " ").toLowerCase()}</b>
                <p>{e.description}</p>
              </div>
              <span className={css.eventId}>#{e.event_id}</span>
            </div>
          ))
        ) : (
          <p className={css.empty}>No events match this filter.</p>
        )}
      </div>
    </>
  );
}
export function MetricsPanel({ state }: { state: StateSnapshot }) {
  return (
    <div className={css.metrics}>
      {[
        [
          "Vehicles queued",
          state.direction_states.reduce((s, d) => s + d.queue_count, 0),
          "Across four approaches",
        ],
        [
          "Mean wait",
          `${state.metrics.mean_wait_ticks.toFixed(1)}s`,
          "Arrival → crossing start",
        ],
        [
          "Vehicles departed",
          state.metrics.departed,
          `${state.metrics.arrived} total arrivals`,
        ],
        [
          "Fairness overrides",
          state.metrics.fairness_overrides,
          `Worst wait: ${state.metrics.max_wait_ticks}s`,
        ],
      ].map(([label, value, detail], i) => (
        <div className={css.metric} key={label}>
          <span>{label}</span>
          <strong>
            {value}
            <small>{i === 0 ? "vehicles" : i === 2 ? "completed" : ""}</small>
          </strong>
          <p>
            <i className={i === 3 ? css.amber : css.green} />
            {detail}
          </p>
        </div>
      ))}
    </div>
  );
}
