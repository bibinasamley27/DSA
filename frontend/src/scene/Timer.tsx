const NA = '—:—:—';
/** Authoritative simulation time (1 tick = 1 s) from the snapshot; not a local clock. */
export function Timer({ tick }: { tick: number | null }) {
  const t = tick === null ? NA : [Math.floor(tick / 3600), Math.floor(tick / 60) % 60, tick % 60].map((n) => String(n).padStart(2, '0')).join(' : ');
  return <div aria-label="Simulation time" style={{ font: '700 1.6rem system-ui', color: '#fff', textShadow: '0 2px 4px #000' }}>{t}</div>;
}
