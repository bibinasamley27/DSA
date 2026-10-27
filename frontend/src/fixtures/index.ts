// Frozen mock fixtures. east_surge / fairness_trap / balanced are per-tick states recorded from the
// real Python engine (seed 42, default config) and renumbered run_id/sequence_number; see README.
import balanced from './balanced.json';
import eastSurge from './east_surge.json';
import fairnessTrap from './fairness_trap.json';
import emergency from './emergency.json';

export type MockStep = { delayMs: number; raw: string } | { delayMs: number; event: 'disconnect' | 'connect' };
export interface MockScript { id: string; label: string; steps: MockStep[] }

const frames = (data: unknown[], delayMs: number): MockStep[] => data.map((f) => ({ delayMs, raw: JSON.stringify(f) }));

/** Frame i of a recording as raw JSON with run/sequence overridden (for protocol edge cases). */
function reissue(frame: unknown, run_id: string, sequence_number: number): string {
  return JSON.stringify({ ...(frame as object), run_id, sequence_number });
}

const welcome = (run: string, seq: number) =>
  JSON.stringify({ protocol_version: '1.0', kind: 'welcome', run_id: run, sequence_number: seq, tick: 0, payload: { shared_simulation: true } });

function protocolEdgeCases(): MockStep[] {
  const f = eastSurge as unknown[];
  const run = 'fixture-east_surge';
  const msg = (kind: 'ack' | 'error', payload: object) =>
    JSON.stringify({ protocol_version: '1.0', kind, run_id: run, sequence_number: 1000, tick: 0, payload });
  return [
    { delayMs: 0, raw: welcome(run, 1) },
    ...frames(f.slice(0, 8), 800),
    { delayMs: 300, raw: reissue(f[3], run, 4) },                       // out-of-order: sequence already passed
    { delayMs: 300, raw: reissue(f[4], 'fixture-obsolete-run', 3) },   // unrelated run, low sequence
    { delayMs: 300, raw: '{"protocol_version":"1.0","kind":"state"' }, // malformed JSON
    { delayMs: 300, raw: '{"protocol_version":"1.0","kind":"state","run_id":"x","sequence_number":50,"tick":1}' }, // schema-invalid
    { delayMs: 300, raw: msg('error', { request_id: null, message: 'Invalid command or lifecycle state' }) },
    ...frames(f.slice(8, 14), 800),
    { delayMs: 500, event: 'disconnect' },
    { delayMs: 2500, event: 'connect' },                                // recovery: fresh welcome + full state, sequence restarts
    { delayMs: 0, raw: welcome(run, 1) },
    { delayMs: 200, raw: reissue(f[14], run, 2) },
    ...f.slice(15, 20).map((x, i) => ({ delayMs: 800, raw: reissue(x, run, 3 + i) })),
    // new run (reset): vehicles vanish, sequence keeps increasing
    ...(fairnessTrap as unknown[]).slice(0, 10).map((x, i) => ({ delayMs: 800, raw: reissue(x, 'fixture-new-run', 100 + i) })),
    { delayMs: 300, raw: reissue(f[20], run, 30) },                     // late message from the retired run
  ];
}

export const MOCK_SCRIPTS: MockScript[] = [
  { id: 'east_surge', label: 'East surge (recorded)', steps: frames(eastSurge, 1000) },
  { id: 'fairness_trap', label: 'Fairness trap (recorded, up to 50 vehicles)', steps: frames(fairnessTrap, 1000) },
  { id: 'balanced', label: 'Balanced (recorded)', steps: frames(balanced, 1000) },
  { id: 'emergency', label: 'Ambulances (recorded, East surge + 5 ambulances)', steps: frames(emergency, 1000) },
  { id: 'edge_cases', label: 'Protocol edge cases (stale, malformed, reconnect, new run)', steps: protocolEdgeCases() },
];

export const getMockScript = (id: string): MockScript => MOCK_SCRIPTS.find((s) => s.id === id) ?? MOCK_SCRIPTS[0]!;
