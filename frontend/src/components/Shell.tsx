import { NavLink, Outlet } from 'react-router-dom';
import { MOCK_SCRIPTS } from '../fixtures';
import { connectLive, connectMock, useSimState } from '../net/connection';
import { ConnectionBadge } from './ConnectionBadge';
import styles from './Shell.module.css';

/** App frame. The connection lives in net/connection.ts, so navigating between pages never restarts it. */
export function Shell() {
  const sim = useSimState();
  const retry = () => (sim.mockId ? connectMock(sim.mockId) : connectLive());
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>Traffic Signal Simulator</h1>
        <nav aria-label="Pages">
          <NavLink to="/" end>Simulation</NavLink>
          <NavLink to="/controller">Controller</NavLink>
        </nav>
        <div className={styles.source}>
          <label>Data source
            <select value={sim.mockId ?? 'live'} onChange={(e) => {
              if (e.target.value === 'live') connectLive();
              else connectMock(e.target.value);
            }}>
              <option value="live">Live backend</option>
              {MOCK_SCRIPTS.map((m) => <option key={m.id} value={m.id}>Mock: {m.label}</option>)}
            </select>
          </label>
        </div>
        <ConnectionBadge sim={sim} onRetry={retry} />
      </header>
      <main className={styles.main}><Outlet /></main>
    </div>
  );
}
