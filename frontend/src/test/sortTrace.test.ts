// Validates the Bubble Sort reconstruction against real engine output (backend/fixtures/*.trace.json, seed 42).
import eastSurge from '../../../backend/fixtures/east_surge.trace.json';
import fairnessTrap from '../../../backend/fixtures/fairness_trap.trace.json';
import oscillation from '../../../backend/fixtures/oscillation.trace.json';
import { SCHEDULE, sortRuns } from '../lib/sortTrace';
import type { DecisionEvent, Direction } from '../types/simulation';

const traces = { east_surge: eastSurge, fairness_trap: fairnessTrap, oscillation } as const;

describe.each(Object.entries(traces))('%s engine trace', (_name, trace) => {
  const events = (trace as unknown as { decisions: DecisionEvent[] }).decisions;
  const runs = sortRuns(events);

  it('reconstructs every planning boundary completely', () => {
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.complete).toBe(true);
      expect(run.steps.filter((s) => s.kind === 'compare').map(({ end, i }) => ({ end, i }))).toEqual(SCHEDULE);
    }
  });

  it('matches a reference descending stable sort and the order the engine then commits or rejects', () => {
    for (const run of runs) {
      const ref = [...run.startOrder].sort((a, b) => run.scores[b]! - run.scores[a]!); // reference sort: allowed in tests (doc 06)
      expect(run.finalOrder).toEqual(ref);
      const after = events.filter((e) => e.tick === run.tick && (e.type === 'ORDER_COMMITTED' || e.type === 'HYSTERESIS_REJECT' || e.type === 'FAIRNESS_OVERRIDE'));
      const verdict = after[0];
      if (verdict?.type === 'HYSTERESIS_REJECT') expect(verdict.data.candidate).toEqual(run.finalOrder);
    }
  });
});

it('reports a truncated trace as incomplete instead of guessing', () => {
  const events = (eastSurge as unknown as { decisions: DecisionEvent[] }).decisions;
  const first = sortRuns(events)[0]!;
  const partial = events.filter((e) => e.tick === first.tick && e.type.startsWith('SORT')).slice(2);
  expect(sortRuns(partial)[0]!.complete).toBe(false);
});

it('animates a swap: the swapped pair changes places in the next step', () => {
  const events = (oscillation as unknown as { decisions: DecisionEvent[] }).decisions;
  const run = sortRuns(events).find((r) => r.swaps > 0)!;
  const idx = run.steps.findIndex((s) => s.kind === 'swap');
  const before = run.steps[idx - 1]!, swap = run.steps[idx]!;
  expect(before.kind).toBe('compare');
  expect(swap.order[swap.i]).toBe(before.order[before.i + 1] as Direction);
  expect(swap.order[swap.i + 1]).toBe(before.order[before.i] as Direction);
});
