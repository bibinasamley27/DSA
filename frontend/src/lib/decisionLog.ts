// Explains controller decisions using only events the backend emitted (no prediction, no re-implementation).
// Engine behaviour this relies on (backend/app/engine.py): at each round boundary it calls plan(), always emits
// ORDER_COMMITTED with the resulting order, then gives every position of that order one GREEN slot, in order.
import type { DecisionEvent, Direction } from '../types/simulation';
import { sortRuns, type SortRun } from './sortTrace';

export type Reason =
  | { kind: 'fixed' }
  | { kind: 'threshold'; triggered: boolean }
  | { kind: 'sort'; run: SortRun }
  | { kind: 'fairness'; direction: Direction; wait: number }
  | { kind: 'reject'; candidate: Direction[]; improvement: number; streak: number }
  | { kind: 'changed' }   // committed order differs from the previous one without a fairness override
  | { kind: 'kept' };     // committed order equals the previous one

export type LogItem =
  | { type: 'boundary'; tick: number; eventId: number; order: Direction[]; previous: Direction[] | null; reasons: Reason[] }
  | { type: 'green'; tick: number; eventId: number; direction: Direction; slot: number | null; order: Direction[] | null; committedAt: number | null }
  | { type: 'clearance'; tick: number; eventId: number; phase: 'YELLOW' | 'ALL_RED'; direction: Direction | null };

const DIRS = new Set<string>(['N', 'E', 'S', 'W']);
const isOrder = (v: unknown): v is Direction[] => Array.isArray(v) && v.length === 4 && v.every((d) => typeof d === 'string' && DIRS.has(d));
const sameOrder = (a: Direction[], b: Direction[]) => a.every((d, i) => d === b[i]);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Chronological, explained log of planning boundaries and phase changes. Pass non-ARRIVAL events (store `plan`). */
export function buildLog(events: DecisionEvent[]): LogItem[] {
  const sorted = [...events].sort((a, b) => a.event_id - b.event_id);
  const runs = new Map(sortRuns(sorted).map((r) => [r.tick, r]));
  const out: LogItem[] = [];
  let committed: { order: Direction[]; tick: number; greens: number } | null = null;
  let previous: Direction[] | null = null;
  for (const e of sorted) {
    if (e.type === 'ORDER_COMMITTED' && isOrder(e.data.order)) {
      const order = e.data.order;
      const atTick = sorted.filter((x) => x.tick === e.tick && x.event_id < e.event_id);
      const threshold = atTick.find((x) => x.type === 'THRESHOLD');
      const fairness = atTick.find((x) => x.type === 'FAIRNESS_OVERRIDE');
      const reject = atTick.find((x) => x.type === 'HYSTERESIS_REJECT');
      const reasons: Reason[] = [];
      if (!threshold) reasons.push({ kind: 'fixed' });
      else {
        reasons.push({ kind: 'threshold', triggered: threshold.data.triggered === true });
        const run = runs.get(e.tick);
        if (run) reasons.push({ kind: 'sort', run });
      }
      if (fairness?.direction) reasons.push({ kind: 'fairness', direction: fairness.direction, wait: num(fairness.data.wait) });
      if (reject && isOrder(reject.data.candidate)) {
        reasons.push({ kind: 'reject', candidate: reject.data.candidate, improvement: num(reject.data.improvement), streak: num(reject.data.streak) });
      }
      if (threshold && !fairness && previous) reasons.push(sameOrder(order, previous) ? { kind: 'kept' } : { kind: 'changed' });
      out.push({ type: 'boundary', tick: e.tick, eventId: e.event_id, order, previous, reasons });
      committed = { order, tick: e.tick, greens: 0 };
      previous = order;
    } else if (e.type === 'PHASE_CHANGE' && e.data.phase === 'GREEN' && e.direction) {
      if (committed) committed.greens += 1;
      out.push({
        type: 'green', tick: e.tick, eventId: e.event_id, direction: e.direction,
        slot: committed ? committed.greens : null, order: committed?.order ?? null, committedAt: committed?.tick ?? null,
      });
    } else if (e.type === 'PHASE_CHANGE' && (e.data.phase === 'YELLOW' || e.data.phase === 'ALL_RED')) {
      out.push({ type: 'clearance', tick: e.tick, eventId: e.event_id, phase: e.data.phase, direction: e.direction });
    }
  }
  return out;
}
