// Rebuilds every intermediate array of the backend's Bubble Sort from its decision trace.
// SORT_COMPARE carries {left, right, left_score, right_score}; SORT_SWAP carries {left, right, order}.
// The backend sort has no early exit, so for 4 directions it always performs exactly these 6 comparisons:
// (end=3: i=0,1,2) (end=2: i=0,1) (end=1: i=0). Any group that does not match is reported as incomplete
// rather than guessed (e.g. when older events were evicted from the client buffer).
import type { DecisionEvent, Direction } from '../types/simulation';

export const SCHEDULE: readonly { end: number; i: number }[] = [
  { end: 3, i: 0 }, { end: 3, i: 1 }, { end: 3, i: 2 }, { end: 2, i: 0 }, { end: 2, i: 1 }, { end: 1, i: 0 },
];

export interface SortStep {
  eventId: number;
  kind: 'compare' | 'swap';
  end: number;
  i: number;
  /** Array state shown for this step: before the swap for a compare, after it for a swap. */
  order: Direction[];
  left: Direction;
  right: Direction;
  leftScore: number;
  rightScore: number;
}

export interface SortRun {
  tick: number;
  complete: boolean;
  startOrder: Direction[];
  finalOrder: Direction[];
  scores: Partial<Record<Direction, number>>;
  steps: SortStep[];
  swaps: number;
}

const DIRS = new Set<string>(['N', 'E', 'S', 'W']);
const isDir = (v: unknown): v is Direction => typeof v === 'string' && DIRS.has(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function build(tick: number, events: DecisionEvent[]): SortRun {
  const compares = events.filter((e) => e.type === 'SORT_COMPARE');
  const empty: SortRun = { tick, complete: false, startOrder: [], finalOrder: [], scores: {}, steps: [], swaps: 0 };
  if (compares.length !== SCHEDULE.length) return empty;
  const cmp = compares.map((e) => ({ l: e.data.left, r: e.data.right, ls: num(e.data.left_score), rs: num(e.data.right_score) }));
  if (cmp.some((c) => !isDir(c.l) || !isDir(c.r) || c.ls === null || c.rs === null)) return empty;
  // Positions 2 and 3 are untouched until compared in the first pass, so the start order is fully determined.
  const arr = [cmp[0]!.l, cmp[0]!.r, cmp[1]!.r, cmp[2]!.r] as Direction[];
  if (new Set(arr).size !== 4) return empty;
  const startOrder = [...arr];
  const scores: Partial<Record<Direction, number>> = {};
  const steps: SortStep[] = [];
  let k = 0;
  let swaps = 0;
  for (const e of events) {
    const at = SCHEDULE[e.type === 'SORT_COMPARE' ? k : k - 1];
    if (!at) return empty;
    const { end, i } = at;
    const left = e.data.left, right = e.data.right;
    if (!isDir(left) || !isDir(right)) return empty;
    if (e.type === 'SORT_COMPARE') {
      if (arr[i] !== left || arr[i + 1] !== right) return empty;
      const ls = num(e.data.left_score)!, rs = num(e.data.right_score)!;
      scores[left] = ls; scores[right] = rs;
      steps.push({ eventId: e.event_id, kind: 'compare', end, i, order: [...arr], left, right, leftScore: ls, rightScore: rs });
      k++;
    } else {
      const order = e.data.order;
      if (!Array.isArray(order) || order.length !== 4 || !order.every(isDir)) return empty;
      if (arr[i] !== left || arr[i + 1] !== right || order[i] !== right || order[i + 1] !== left) return empty;
      arr.splice(0, 4, ...order);
      swaps++;
      steps.push({ eventId: e.event_id, kind: 'swap', end, i, order: [...arr], left, right, leftScore: scores[left] ?? 0, rightScore: scores[right] ?? 0 });
    }
  }
  return { tick, complete: true, startOrder, finalOrder: [...arr], scores, steps, swaps };
}

/** One run per planning boundary (tick) that contains sort events, oldest first. */
export function sortRuns(events: DecisionEvent[]): SortRun[] {
  const byTick = new Map<number, DecisionEvent[]>();
  for (const e of events) {
    if (e.type !== 'SORT_COMPARE' && e.type !== 'SORT_SWAP') continue;
    const list = byTick.get(e.tick) ?? [];
    list.push(e);
    byTick.set(e.tick, list);
  }
  return [...byTick.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tick, list]) => build(tick, [...list].sort((a, b) => a.event_id - b.event_id)));
}
