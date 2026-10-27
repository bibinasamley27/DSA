import type { SimState } from '../net/store';
import { DIRECTIONS } from '../net/protocol';
import styles from './HUD.module.css';

const NA = '—';
const PHASE_LABEL = { GREEN: 'Green', YELLOW: 'Yellow', ALL_RED: 'All red (clearance)' } as const;

/** DOM overlay: every number is copied from the accepted snapshot; nothing is derived or defaulted. */
export function HUD({ sim }: { sim: SimState }) {
  const s = sim.snapshot;
  return (
    <aside className={styles.hud} aria-label="Simulation status">
      {sim.stale && <p className={styles.stale} role="status">Disconnected — showing the last server snapshot</p>}
      <dl className={styles.grid}>
        <div><dt>Status</dt><dd>{s?.sim_status ?? NA}</dd></div>
        <div><dt>Tick</dt><dd>{s?.tick ?? NA}</dd></div>
        <div><dt>Phase</dt><dd>{s ? PHASE_LABEL[s.phase] : NA}</dd></div>
        <div><dt>Active direction</dt><dd data-testid="active-direction">{s ? (s.active_direction ?? 'None') : NA}</dd></div>
        <div><dt>Phase remaining</dt><dd>{s ? `${s.phase_remaining} s` : NA}</dd></div>
        <div><dt>Controller</dt><dd>{s?.controller_mode ?? NA}</dd></div>
        <div><dt>Signal order</dt><dd>{s ? s.queue_order.join(' → ') : NA}</dd></div>
        <div><dt>Run</dt><dd title={s?.run_id}>{s ? s.run_id.slice(0, 8) : NA}</dd></div>
      </dl>
      <table className={styles.table}>
        <caption>Queues</caption>
        <thead><tr><th scope="col">Dir</th><th scope="col">Queued</th><th scope="col">Max wait</th><th scope="col">Score</th></tr></thead>
        <tbody>
          {DIRECTIONS.map((d) => {
            const row = s?.direction_states.find((x) => x.direction === d);
            return (
              <tr key={d} className={row?.congestion_flag ? styles.hot : undefined}>
                <th scope="row">{d}</th>
                <td>{row?.queue_count ?? NA}</td>
                <td>{row ? `${row.max_wait_ticks} s` : NA}</td>
                <td>{row?.priority_score ?? NA}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <dl className={styles.grid}>
        <div><dt>Arrived</dt><dd>{s?.metrics.arrived ?? NA}</dd></div>
        <div><dt>Departed</dt><dd>{s?.metrics.departed ?? NA}</dd></div>
        <div><dt>Mean wait</dt><dd>{s ? `${s.metrics.mean_wait_ticks.toFixed(1)} s` : NA}</dd></div>
        <div><dt>Max wait</dt><dd>{s ? `${s.metrics.max_wait_ticks} s` : NA}</dd></div>
        <div><dt>Switches</dt><dd>{s?.metrics.switches ?? NA}</dd></div>
        <div><dt>Fairness overrides</dt><dd>{s?.metrics.fairness_overrides ?? NA}</dd></div>
        <div><dt>Ambulances</dt><dd>{s?.metrics.emergencies ?? NA}</dd></div>
        <div><dt>Mean ambulance wait</dt><dd>{s ? (s.metrics.emergencies ? `${s.metrics.mean_emergency_wait_ticks.toFixed(1)} s` : 'none yet') : NA}</dd></div>
        <div><dt>Vehicles shown</dt><dd>{s?.vehicles.length ?? NA}</dd></div>
      </dl>
    </aside>
  );
}
