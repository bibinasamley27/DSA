import type { SimState } from '../net/store';
import styles from './Shell.module.css';

const LABEL: Record<SimState['connection'], string> = {
  idle: 'Not connected', connecting: 'Connecting…', open: 'Connected', reconnecting: 'Reconnecting…',
  closed: 'Disconnected', failed: 'Connection failed',
};

export function ConnectionBadge({ sim, onRetry }: { sim: SimState; onRetry: () => void }) {
  const bad = sim.connection === 'failed' || sim.connection === 'closed';
  return (
    <div className={styles.conn} role="status" aria-live="polite">
      <span className={`${styles.dot} ${styles[sim.connection]}`} aria-hidden="true" />
      <span>{LABEL[sim.connection]}</span>
      {sim.mode === 'mock' && <strong className={styles.mock}>MOCK DATA</strong>}
      {bad && <button type="button" onClick={onRetry}>Retry</button>}
      {sim.error && <span className={styles.err}>{sim.error}</span>}
      {(sim.rejected.malformed + sim.rejected.staleSequence + sim.rejected.staleRun) > 0 && (
        <span className={styles.muted} title="Messages dropped at the network boundary">
          dropped: {sim.rejected.malformed} malformed, {sim.rejected.staleSequence} out-of-order, {sim.rejected.staleRun} old-run
        </span>
      )}
    </div>
  );
}
