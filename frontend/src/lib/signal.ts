import type { Direction, StateSnapshot } from '../types/simulation';

export type LampColor = 'red' | 'yellow' | 'green';

/** Pure read of the authoritative phase; the frontend never predicts transitions. */
export function lampFor(direction: Direction, s: Pick<StateSnapshot, 'phase' | 'active_direction'> | null): LampColor | null {
  if (!s) return null;
  if (s.active_direction !== direction) return 'red';
  return s.phase === 'GREEN' ? 'green' : s.phase === 'YELLOW' ? 'yellow' : 'red';
}
