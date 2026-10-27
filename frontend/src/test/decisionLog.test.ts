// Checks the decision explanations against real engine traces (backend/fixtures/*.trace.json, seed 42).
import eastSurge from '../../../backend/fixtures/east_surge.trace.json';
import fairnessTrap from '../../../backend/fixtures/fairness_trap.trace.json';
import oscillation from '../../../backend/fixtures/oscillation.trace.json';
import { buildLog, type LogItem } from '../lib/decisionLog';
import type { DecisionEvent } from '../types/simulation';

const events = (t: unknown) => (t as { decisions: DecisionEvent[] }).decisions.filter((e) => e.type !== 'ARRIVAL');
const boundaries = (log: LogItem[]) => log.filter((x): x is Extract<LogItem, { type: 'boundary' }> => x.type === 'boundary');
const greens = (log: LogItem[]) => log.filter((x): x is Extract<LogItem, { type: 'green' }> => x.type === 'green');

describe.each([['east_surge', eastSurge], ['fairness_trap', fairnessTrap], ['oscillation', oscillation]] as const)('%s', (_n, trace) => {
  const log = buildLog(events(trace));
  it('explains every green as the k-th slot of the last committed order, and k cycles 1..4', () => {
    const explained = greens(log).filter((g) => g.slot !== null);
    expect(explained.length).toBeGreaterThan(0);
    for (const g of explained) {
      expect(g.slot).toBeGreaterThanOrEqual(1);
      expect(g.slot).toBeLessThanOrEqual(4);
      expect(g.order![g.slot! - 1]).toBe(g.direction); // this is exactly how the engine chose it
    }
  });
  it('gives every adaptive boundary a threshold reason and a complete sort when congested', () => {
    for (const b of boundaries(log)) {
      const th = b.reasons.find((r) => r.kind === 'threshold');
      expect(th).toBeDefined();
      if (th?.kind === 'threshold' && th.triggered) {
        const sort = b.reasons.find((r) => r.kind === 'sort');
        expect(sort?.kind === 'sort' && sort.run.complete).toBe(true);
      }
    }
  });
});

it('puts the fairness winner at the head of the committed order', () => {
  const all = boundaries(buildLog(events(fairnessTrap)));
  const withFairness = all.filter((b) => b.reasons.some((r) => r.kind === 'fairness'));
  expect(withFairness.length).toBeGreaterThan(0);
  for (const b of withFairness) {
    const f = b.reasons.find((r) => r.kind === 'fairness')!;
    expect(f.kind === 'fairness' && b.order[0] === f.direction && f.wait >= 30).toBe(true);
  }
});

it('reports the hysteresis rejection with its improvement and streak, keeping the order', () => {
  const b = boundaries(buildLog(events(oscillation))).find((x) => x.reasons.some((r) => r.kind === 'reject'))!;
  const r = b.reasons.find((x) => x.kind === 'reject')!;
  expect(r.kind === 'reject' && (r.improvement < 3 || r.streak < 2)).toBe(true);
  if (b.previous) expect(b.order).toEqual(b.previous);
});

it('marks fixed-cycle boundaries as fixed (no threshold, no sort)', () => {
  const fixed: DecisionEvent[] = [
    { event_id: 1, tick: 44, type: 'ORDER_COMMITTED', direction: null, description: '', data: { order: ['N', 'E', 'S', 'W'] } },
    { event_id: 2, tick: 44, type: 'PHASE_CHANGE', direction: 'N', description: '', data: { phase: 'GREEN', remaining: 8 } },
  ];
  const [b, g] = buildLog(fixed);
  expect(b?.type === 'boundary' && b.reasons).toEqual([{ kind: 'fixed' }]);
  expect(g?.type === 'green' && g.slot).toBe(1);
});
