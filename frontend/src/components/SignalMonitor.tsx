import { Radio, ShieldCheck, Timer, ArrowRight } from "lucide-react";
import type {
  Direction,
  StateSnapshot,
  DecisionEvent,
} from "../types/simulation";
import css from "../pages/ControllerPage.module.css";
const locations: Record<Direction, { x: number; y: number; rotate: number }> = {
  N: { x: 190, y: 44, rotate: 0 },
  E: { x: 322, y: 148, rotate: 90 },
  S: { x: 190, y: 252, rotate: 180 },
  W: { x: 58, y: 148, rotate: 270 },
};
export function SignalMonitor({
  state,
  events,
}: {
  state: StateSnapshot;
  events: DecisionEvent[];
}) {
  const decision = [...events]
    .reverse()
    .find((e) =>
      [
        "ORDER_COMMITTED",
        "FAIRNESS_OVERRIDE",
        "HYSTERESIS_REJECT",
        "THRESHOLD",
      ].includes(e.type),
    );
  return (
    <section className={css.signalMonitor}>
      <div className={css.junctionPanel}>
        <div className={css.monitorLabel}>
          <Radio size={12} /> TRAFFIC SIGNALS <span>TOP VIEW</span>
        </div>
        <svg
          viewBox="0 0 380 296"
          role="img"
          aria-label={`Intersection telemetry: ${state.phase}, ${state.active_direction ?? "all approaches red"}`}
        >
          <defs>
            <pattern
              id="monitorGrid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M20 0H0V20"
                fill="none"
                stroke="#29483f"
                strokeWidth=".5"
              />
            </pattern>
          </defs>
          <rect width="380" height="296" fill="url(#monitorGrid)" />
          <path
            d="M147 0H233V105H380V191H233V296H147V191H0V105H147Z"
            fill="#263c40"
            stroke="#385459"
          />
          <path
            d="M190 0V100 M190 196V296 M0 148H141 M239 148H380"
            stroke="#a3b7a3"
            strokeWidth="1"
            strokeDasharray="7 8"
            opacity=".45"
          />
          <rect
            x="148"
            y="106"
            width="84"
            height="84"
            fill="#2c4846"
            stroke="#496659"
            strokeDasharray="3 5"
          />
          <path
            d="M153 99H184 M238 111V142 M196 197H227 M142 154V185"
            stroke="#d7e5d6"
            strokeWidth="3"
            opacity=".65"
          />
          {state.direction_states.map((d) => {
            const p = locations[d.direction];
            const active = state.active_direction === d.direction;
            const color =
              active && state.phase === "GREEN"
                ? "#8fdbb0"
                : active && state.phase === "YELLOW"
                  ? "#efc371"
                  : "#bf746d";
            return (
              <g key={d.direction}>
                <g transform={`translate(${p.x},${p.y}) rotate(${p.rotate})`}>
                  {Array.from(
                    { length: Math.min(5, d.queue_count) },
                    (_, i) => (
                      <rect
                        key={i}
                        x="-24"
                        y={18 - i * 15}
                        rx="2"
                        width="12"
                        height="10"
                        fill={active ? "#8abfa2" : "#75958e"}
                        opacity={1 - i * 0.1}
                      />
                    ),
                  )}
                  <rect
                    x="30"
                    y="-7"
                    width="12"
                    height="32"
                    rx="4"
                    fill="#132c2b"
                    stroke="#587465"
                  />
                  <circle
                    cx="36"
                    cy="0"
                    r="3"
                    fill={color === "#bf746d" ? color : "#3e5150"}
                  />
                  <circle
                    cx="36"
                    cy="9"
                    r="3"
                    fill={color === "#efc371" ? color : "#3e5150"}
                  />
                  <circle
                    cx="36"
                    cy="18"
                    r="3"
                    fill={color === "#8fdbb0" ? color : "#3e5150"}
                  />
                </g>
                <text
                  x={
                    p.x +
                    (d.direction === "E" ? 30 : d.direction === "W" ? -30 : 0)
                  }
                  y={
                    p.y +
                    (d.direction === "N" ? -25 : d.direction === "S" ? 35 : 0)
                  }
                  textAnchor="middle"
                  fill="#a1bdb1"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {d.direction} · {d.queue_count}
                </text>
              </g>
            );
          })}
          <circle cx="190" cy="148" r="18" fill="#183c30" stroke="#699e78" />
          <text
            x="190"
            y="153"
            textAnchor="middle"
            fill="#acd8b5"
            fontSize="13"
            fontFamily="monospace"
          >
            {state.active_direction ?? "—"}
          </text>
        </svg>
        <div className={css.monitorFoot}>
          <i className={css.green} />{" "}
          {state.phase === "ALL_RED"
            ? "All approaches red"
            : `Only ${state.active_direction} is active`}{" "}
          <span>UP TO 5 CARS SHOWN PER LANE</span>
        </div>
      </div>
      <div className={css.monitorBody}>
        <div className={css.monitorTitle}>
          <span className={css.eyebrow}>FOUR-WAY INTERSECTION</span>
          <span className={css.darkPill}>
            {state.controller_mode.toUpperCase()}
          </span>
        </div>
        <h2>Signal Schedule</h2>
        <p className={css.monitorSubtitle}>
          The highlighted direction is currently active. The queue below shows
          the signal order received from the controller.
        </p>
        <div className={css.scheduleStrip}>
          {state.queue_order.map((d, i) => (
            <span key={d}>
              <b
                className={
                  d === state.active_direction ? css.activeSchedule : ""
                }
              >
                {d}
              </b>
              {i < 3 && <ArrowRight size={13} />}
            </span>
          ))}
          <span className={css.scheduleLoop}>↻</span>
        </div>
        <div className={css.policyRow}>
          <span>
            <ShieldCheck size={14} /> Fairness <b>≥ 30s</b>
          </span>
          <span>
            <Timer size={14} /> Stability <b>2 boundaries</b>
          </span>
        </div>
        <div className={css.latestDecision}>
          <span>LAST SCHEDULING DECISION</span>
          <h3>
            {decision
              ? decision.type.replaceAll("_", " ").toLowerCase()
              : "Awaiting planning event"}
          </h3>
          <p>
            {decision?.description ??
              "Decisions will appear when the Python controller evaluates the next plan."}
          </p>
        </div>
      </div>
    </section>
  );
}
