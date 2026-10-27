// Decorative pedestrians. The backend has no pedestrian model (PRD non-goal), so they never affect the simulation
// or metrics. They only *read* the authoritative signal state to decide when crossing is safe, and are driven by
// SimClock, so they freeze with the simulation and reset with a new run.
import type { Direction, StateSnapshot } from '../types/simulation';
import { OUTWARD, ROAD_HALF, SIDE_HALF, SIDE_STREET, SIDEWALK_W, STOP } from './geometry';

export const STREET_FURNITURE = ROAD_HALF + SIDEWALK_W - 0.25; // trees/lamps line, outside both walking lanes

export interface PedPose { x: number; z: number; heading: number; walking: boolean; onRoad: boolean }

/** Ticks a crossing takes. A pedestrian only steps off when the current green leaves at least this long. */
export const CROSS_TICKS = 4;
export const CROSSWALK_AT = (STOP + ROAD_HALF) / 2;   // crosswalk centre distance from the junction centre
/**
 * Waiting spot on the sidewalk, measured across the road. N/S and E/W crosswalks meet at each corner, so they use
 * different distances (and lanes 0.9 apart along the crosswalk) to keep every waiting spot ≥ 0.6 apart.
 */
export const crossEnd = (arm: Direction) => (arm === 'N' || arm === 'S' ? ROAD_HALF + 0.8 : ROAD_HALF + 1.8);
export const CROSS_LANES = [-0.7, 0.2] as const;

const right = (d: Direction) => ({ x: OUTWARD[d].z, z: -OUTWARD[d].x }); // across-the-road unit vector
const headingOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);       // model faces -Z at heading 0

/**
 * Crossing arm `arm` conflicts with traffic entering from `arm` and traffic leaving through it (the opposite approach).
 * It is safe only while the perpendicular road holds GREEN for the whole crossing.
 */
export function crossingAllowed(arm: Direction, s: StateSnapshot | null, clock: number): boolean {
  if (!s || s.sim_status !== 'running' || s.phase !== 'GREEN' || s.active_direction === null) return false;
  const vertical = (d: Direction) => d === 'N' || d === 'S';
  if (vertical(arm) === vertical(s.active_direction)) return false;
  return clock + CROSS_TICKS <= s.tick + s.phase_remaining;
}

export interface Crosser { arm: Direction; side: 1 | -1; crossing: boolean; t0: number; minWait: number; lane: number }

/** Two pedestrians per crosswalk, starting at opposite ends. */
export function makeCrossers(): Crosser[] {
  return (['N', 'E', 'S', 'W'] as const).flatMap((arm, i) => [
    { arm, side: 1 as const, crossing: false, t0: 0, minWait: 1 + (i % 2), lane: CROSS_LANES[0] },
    { arm, side: -1 as const, crossing: false, t0: 0, minWait: 2 + (i % 2), lane: CROSS_LANES[1] },
  ]);
}

/** Advance crossers to `clock`. Mutates in place (per-frame, allocation-free). */
export function stepCrossers(list: Crosser[], s: StateSnapshot | null, clock: number) {
  for (const c of list) {
    if (c.crossing && clock >= c.t0 + CROSS_TICKS) {
      c.crossing = false; c.side = c.side === 1 ? -1 : 1; c.t0 += CROSS_TICKS;
    } else if (!c.crossing && clock - c.t0 >= c.minWait && crossingAllowed(c.arm, s, clock)) {
      c.crossing = true; c.t0 = clock;
    }
  }
}

export function crosserPose(c: Crosser, clock: number): PedPose {
  const o = OUTWARD[c.arm], r = right(c.arm);
  const along = CROSSWALK_AT + c.lane;
  const k = c.crossing ? Math.min(1, Math.max(0, (clock - c.t0) / CROSS_TICKS)) : 0;
  const lat = c.side * crossEnd(c.arm) * (1 - 2 * k);
  const x = o.x * along + r.x * lat, z = o.z * along + r.z * lat;
  // facing across the road toward the other end, whether waiting or walking
  return { x, z, heading: headingOf(-r.x * c.side, -r.z * c.side), walking: c.crossing, onRoad: Math.abs(lat) < ROAD_HALF + 0.12 };
}

/** Sidewalk strips with one walker each, so walkers never walk through one another. */
const SEGMENTS = [[7, SIDE_STREET - SIDE_HALF - 2], [SIDE_STREET + SIDE_HALF + 2, 108]] as const;
export const WALKER_SPEED = 0.6; // world units per tick
/** Two walking lanes per sidewalk, clear of the kerb and of the street trees/lamps at the outer edge. */
export const WALK_LANES = [ROAD_HALF + 0.7, ROAD_HALF + SIDEWALK_W - 1.15] as const;
export interface Walker { arm: Direction; side: 1 | -1; lane: number; from: number; to: number; phase: number }

export function makeWalkers(): Walker[] {
  const out: Walker[] = [];
  let i = 0;
  for (const arm of ['N', 'E', 'S', 'W'] as const) for (const side of [1, -1] as const) for (const [from, to] of SEGMENTS) {
    for (const lane of WALK_LANES) {
      out.push({ arm, side, lane, from, to, phase: (i * 0.37) % 1 });
      i++;
    }
  }
  return out;
}

/** Pure function of the clock: back-and-forth along the walker's own strip. */
export function walkerPose(w: Walker, clock: number): PedPose {
  const len = w.to - w.from;
  const u = (w.phase + (clock * WALKER_SPEED) / (2 * len)) % 1;
  const outward = u < 0.5;
  const along = w.from + len * (outward ? u * 2 : 2 - u * 2);
  const o = OUTWARD[w.arm], r = right(w.arm);
  const x = o.x * along + r.x * w.side * w.lane, z = o.z * along + r.z * w.side * w.lane;
  const sign = outward ? 1 : -1;
  return { x, z, heading: headingOf(o.x * sign, o.z * sign), walking: true, onRoad: false };
}
