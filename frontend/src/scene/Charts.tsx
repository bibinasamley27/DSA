import { DIRECTIONS } from '../net/protocol';
import type { SimState } from '../net/store';
import styles from './Charts.module.css';

function Bars({ title, unit, values }: { title: string; unit: string; values: (number | null)[] }) {
  const max = Math.max(5, ...values.map((v) => v ?? 0)); // axis auto-scales; the backend reports no capacity in snapshots
  return (
    <figure className={styles.chart}>
      <figcaption>{title}</figcaption>
      <div className={styles.bars} role="img" aria-label={`${title}: ${DIRECTIONS.map((d, i) => `${d} ${values[i] ?? 'unavailable'}`).join(', ')}`}>
        {DIRECTIONS.map((d, i) => {
          const v = values[i] ?? null;
          return (
            <div key={d} className={styles.col}>
              <span className={styles.val}>{v === null ? '—' : v}</span>
              <div className={styles.bar} style={{ height: `${v === null ? 0 : (v / max) * 100}%` }} />
              <span className={styles.lab}>{d}</span>
            </div>
          );
        })}
      </div>
      <small>{unit} · axis 0–{max}</small>
    </figure>
  );
}

/** Bar charts of backend-reported per-approach values only. */
export function Charts({ sim }: { sim: SimState }) {
  const rows = DIRECTIONS.map((d) => sim.snapshot?.direction_states.find((x) => x.direction === d) ?? null);
  return (
    <div className={styles.charts}>
      <Bars title="Queue density" unit="vehicles waiting" values={rows.map((r) => r?.queue_count ?? null)} />
      <Bars title="Longest wait" unit="seconds" values={rows.map((r) => r?.max_wait_ticks ?? null)} />
    </div>
  );
}
