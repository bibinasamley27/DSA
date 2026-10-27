import { useState } from 'react';
import { CONTROLLERS, SCENARIOS, SPEEDS, validateCommand, type CommandInput } from '../net/commands';
import type { SimState } from '../net/store';
import styles from './Controls.module.css';

const STATUS_TEXT = {
  sent: 'sent, waiting for server',
  accepted: 'accepted by server, awaiting new state',
  applied: 'accepted; new state received',
  rejected: 'rejected by server',
  timeout: 'no reply',
  not_sent: 'not sent',
} as const;

export function Controls({ sim, onCommand }: { sim: SimState; onCommand: (c: CommandInput) => void }) {
  const s = sim.snapshot;
  const [draft, setDraft] = useState<string | null>(null);
  const open = sim.connection === 'open' && !sim.stale;
  const reason = (c: CommandInput) => (open ? validateCommand(c, s) : 'Not connected');
  const seedText = draft ?? String(s?.seed ?? '');
  const seedCmd: CommandInput = { command: 'set_seed', seed: Number(seedText) };
  const seedProblem = seedText.trim() === '' ? 'Enter an integer seed' : reason(seedCmd);
  const last = sim.commands[0];

  const setupBlocked = reason({ command: 'set_speed', speed: 1 }); // all setup commands share the pause rule

  return (
    <section className={styles.panel} aria-label="Simulation controls">
      <label>Scenario
        <select value={s?.scenario ?? ''} disabled={setupBlocked !== null} title={setupBlocked ?? undefined}
          onChange={(e) => {
            const scenario = SCENARIOS.find((x) => x === e.target.value);
            if (scenario) onCommand({ command: 'set_scenario', scenario });
          }}>
          {s && !SCENARIOS.some((x) => x === s.scenario) && <option value={s.scenario}>{s.scenario}</option>}
          {!s && <option value="">—</option>}
          {SCENARIOS.map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
        </select>
      </label>
      <label>Signal mode
        <select value={s?.controller_mode ?? ''} disabled={setupBlocked !== null} title={setupBlocked ?? undefined}
          onChange={(e) => {
            const controller_mode = CONTROLLERS.find((x) => x === e.target.value);
            if (controller_mode) onCommand({ command: 'set_controller', controller_mode });
          }}>
          {!s && <option value="">—</option>}
          {CONTROLLERS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <label>Speed
        <select value={s?.speed ?? ''} disabled={setupBlocked !== null} title={setupBlocked ?? undefined}
          onChange={(e) => {
            const speed = SPEEDS.find((x) => x === Number(e.target.value));
            if (speed !== undefined) onCommand({ command: 'set_speed', speed });
          }}>
          {!s && <option value="">—</option>}
          {SPEEDS.map((x) => <option key={x} value={x}>{x}×</option>)}
        </select>
      </label>
      <form className={styles.seed} onSubmit={(e) => { e.preventDefault(); if (!seedProblem) { onCommand(seedCmd); setDraft(null); } }}>
        <label>Seed
          <input type="number" step={1} inputMode="numeric" value={seedText} onChange={(e) => setDraft(e.target.value)}
            aria-invalid={seedProblem !== null && draft !== null} />
        </label>
        <button type="submit" disabled={seedProblem !== null} title={seedProblem ?? undefined}>Apply seed</button>
      </form>
      <p className={styles.hint}>Scenario, seed, mode and speed restart or reconfigure the run and need a paused simulation.</p>
      <p className={styles.status} role="status" aria-live="polite">
        {last ? <>Last command <b>{last.label}</b>: {STATUS_TEXT[last.status]}{last.message ? ` — ${last.message}` : ''}</> : 'No commands sent yet'}
      </p>
    </section>
  );
}

const ICONS = {
  reset: <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />,
  start: <path d="M8 5v14l11-7z" />,
  step: <path d="M6 5v14l8-7zM16 5h2.5v14H16z" />,
} as const;

const RUN: { command: 'reset' | 'pause' | 'start' | 'step'; label: string }[] = [
  { command: 'reset', label: 'Reset simulation' }, { command: 'pause', label: 'Pause' },
  { command: 'start', label: 'Start' }, { command: 'step', label: 'Step' },
];

/** Icon-only run controls; each has an accessible name and a disabled-reason tooltip. */
export function Playback({ sim, onCommand }: { sim: SimState; onCommand: (c: CommandInput) => void }) {
  const open = sim.connection === 'open' && !sim.stale;
  return (
    <div className={styles.playback} role="group" aria-label="Run">
      {RUN.map(({ command, label }) => {
        const why = open ? validateCommand({ command }, sim.snapshot) : 'Not connected';
        return (
          <button key={command} type="button" aria-label={label} title={why ?? label} disabled={why !== null} onClick={() => onCommand({ command })}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">{ICONS[command]}</svg>
          </button>
        );
      })}
    </div>
  );
}
