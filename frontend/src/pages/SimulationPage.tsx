import { useState } from 'react';
import { Controls, EmergencyControl, Playback } from '../components/Controls';
import { store, useSimState } from '../net/connection';
import { Charts } from '../scene/Charts';
import { HUD } from '../scene/HUD';
import { Scene } from '../scene/Scene';
import { Timer } from '../scene/Timer';
import styles from './SimulationPage.module.css';

export default function SimulationPage() {
  const sim = useSimState();
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [viewKey, setViewKey] = useState(0);
  const send = (c: Parameters<typeof store.sendCommand>[0]) => store.sendCommand(c);
  return (
    <div className={styles.page}>
      <div className={styles.view}>
        <Scene sim={sim} quality={quality} viewKey={viewKey} />
        <div className={styles.viewTools}>
          <button type="button" onClick={() => setViewKey((k) => k + 1)}>Reset view</button>
          <button type="button" aria-pressed={quality === 'high'} onClick={() => setQuality((q) => (q === 'high' ? 'low' : 'high'))}>
            {quality === 'high' ? 'High quality' : 'Low detail'}
          </button>
        </div>
        <div className={styles.playback}><Playback sim={sim} onCommand={send} /></div>
        <div className={styles.timer}><Timer tick={sim.snapshot?.tick ?? null} /></div>
        {sim.snapshot?.preemption && (
          <p className={styles.emergencyBanner} role="status">
            EMERGENCY · clearing the {({ N: 'North', E: 'East', S: 'South', W: 'West' } as const)[sim.snapshot.preemption.direction]} lane for ambulance #{sim.snapshot.preemption.vehicle_id}
          </p>
        )}
        {!sim.snapshot && <p className={styles.empty} role="status">Waiting for the first server snapshot…</p>}
        {sim.snapshot && sim.snapshot.vehicles.length === 0 && <p className={styles.badge}>No vehicles in the junction</p>}
      </div>
      <div className={styles.left}>
        <Controls sim={sim} onCommand={send} />
        <EmergencyControl sim={sim} onCommand={send} />
        <details className={styles.details}>
          <summary>Status &amp; metrics</summary>
          <HUD sim={sim} />
        </details>
      </div>
      <div className={styles.right}><Charts sim={sim} /></div>
    </div>
  );
}
