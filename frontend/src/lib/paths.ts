// Road paths for presentation only: how a simulated car drives in to its queue slot and out of the junction.
// Right-hand traffic, one lane each way on every road. Decorative turns (ADR 0002): the engine models straight-through
// traffic only and sends no destination, so the turn is a deterministic visual choice made from the vehicle id.
import type { Direction } from '../types/simulation';
import { CAR_LEN, LANE_W, OUTWARD, QUEUE_SPACING, ROAD_HALF, SIDE_STREET, STOP, WORLD } from './geometry';

export interface Vec { x: number; z: number }
export interface PathPose { x: number; z: number; heading: number }
export type Turn = 'L' | 'S' | 'R';

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, z: a.z + b.z });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, z: a.z * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z;
const LAT = LANE_W / 2;
/** Driver's right of a travel direction (model faces -Z at heading 0). */
export const rightOf = (v: Vec): Vec => ({ x: -v.z, z: v.x });
/** Inbound travel direction of approach d (toward the junction). */
export const travel = (d: Direction): Vec => mul(OUTWARD[d], -1);
/** Lateral offset of the inbound lane of arm d (the driver's right side). */
const inLat = (d: Direction): Vec => mul(rightOf(travel(d)), LAT);
export const inboundPoint = (d: Direction, s: number): Vec => add(mul(OUTWARD[d], s), inLat(d));
export const outboundPoint = (a: Direction, s: number): Vec => add(mul(OUTWARD[a], s), mul(inLat(a), -1));
const headingOf = (v: Vec) => Math.atan2(-v.x, -v.z);
const OPP: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ARMS: Direction[] = ['N', 'E', 'S', 'W'];
const armFor = (v: Vec) => ARMS.find((a) => Math.abs(dot(OUTWARD[a], v) - 1) < 1e-9)!;

/** Arm a car from approach d leaves through. */
export function exitArm(d: Direction, turn: Turn): Direction {
  if (turn === 'S') return OPP[d];
  const r = rightOf(travel(d));
  return armFor(turn === 'R' ? r : mul(r, -1));
}

function intersect(p: Vec, u: Vec, q: Vec, v: Vec): Vec {
  const den = u.x * v.z - u.z * v.x;
  const t = ((q.x - p.x) * v.z - (q.z - p.z) * v.x) / den;
  return add(p, mul(u, t));
}
function curve(a: Vec, c: Vec, b: Vec, n = 10): Vec[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n, s = 1 - t;
    return { x: s * s * a.x + 2 * s * t * c.x + t * t * b.x, z: s * s * a.z + 2 * s * t * c.z + t * t * b.z };
  });
}

export class Path {
  readonly pts: Vec[];
  readonly cum: number[];
  readonly length: number;
  constructor(points: Vec[]) {
    const pts: Vec[] = [];
    for (const p of points) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-4) pts.push(p);
    }
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z));
    this.length = this.cum[this.cum.length - 1]!;
  }
  at(d: number): PathPose {
    const L = Math.min(Math.max(d, 0), this.length);
    let i = 1;
    while (i < this.pts.length - 1 && this.cum[i]! < L) i++;
    const a = this.pts[i - 1]!, b = this.pts[i] ?? a;
    const seg = this.cum[i]! - this.cum[i - 1]! || 1;
    const k = (L - this.cum[i - 1]!) / seg;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading: headingOf({ x: b.x - a.x, z: b.z - a.z }) };
  }
  /** First distance (sampled) at which `pred` holds, or null. */
  find(pred: (p: Vec) => boolean, step = 0.1): number | null {
    for (let d = 0; d <= this.length; d += step) if (pred(this.at(d))) return d;
    return null;
  }
  /** Same path with `p` prepended (used when a car is not yet at the path start). */
  from(p: Vec): Path { return new Path([p, ...this.pts]); }
}

export interface JunctionPath { path: Path; arm: Direction; turn: Turn; /** distance at path_progress 0.5 */ checkpoint: number }

/**
 * Head-of-queue position → through the junction (straight or a quarter turn) → out along the exit arm, either to the
 * world edge or, if `offRamp`, turning right onto the side street there.
 */
export function junctionPath(d: Direction, turn: Turn, offRamp: boolean): JunctionPath {
  const t = travel(d);
  const arm = exitArm(d, turn);
  const oa = OUTWARD[arm];
  const pts: Vec[] = [inboundPoint(d, STOP + CAR_LEN / 2)];
  if (turn !== 'S') {
    const X = intersect(inboundPoint(d, 0), t, outboundPoint(arm, 0), oa);
    const r = turn === 'R' ? ROAD_HALF : ROAD_HALF * 1.5;
    const A = add(X, mul(t, -r)), B = add(X, mul(oa, r));
    pts.push(A, ...curve(A, X, B));
  }
  if (offRamp) {
    const v = rightOf(oa);                               // right turn off the outbound lane
    const X2 = add(add(mul(oa, SIDE_STREET), mul(rightOf(v), LAT)), mul(inLat(arm), -1));
    const r2 = ROAD_HALF;
    const A2 = add(X2, mul(oa, -r2)), B2 = add(X2, mul(v, r2));
    pts.push(A2, ...curve(A2, X2, B2), add(X2, mul(v, WORLD - 2 - dot(X2, v))));
  } else {
    pts.push(outboundPoint(arm, WORLD - 2));
  }
  const path = new Path(pts);
  const out = path.find((p) => dot(p, oa) >= STOP + CAR_LEN / 2) ?? path.length;
  return { path, arm, turn, checkpoint: out / 2 };
}

/** Side-street part of an approach route stays clear of traffic turning off at the next corner (58). */
export const SIDE_ENTRY_MAX = 50;
const routes = new Map<Direction, Path>();

/**
 * The whole way in for approach d, ending at the head-of-queue slot. Route distance r is measured back from that end,
 * so queue slot q sits at r = q * QUEUE_SPACING. North/South come straight down the long road; East/West come down
 * the side street and turn right onto the approach at the corner (no lane is crossed).
 */
export function approachRoute(d: Direction): Path {
  const cached = routes.get(d);
  if (cached) return cached;
  const t = travel(d);
  const head = inboundPoint(d, STOP + CAR_LEN / 2);
  let path: Path;
  if (d === 'E' || d === 'W') {
    const u: Vec = { x: t.z, z: -t.x };                // side-street direction whose right turn joins the inbound lane
    const X = add(add(mul(OUTWARD[d], SIDE_STREET), mul(t, LAT)), inLat(d));
    const A = add(X, mul(u, -ROAD_HALF));
    path = new Path([add(A, mul(u, -SIDE_ENTRY_MAX)), A, ...curve(A, X, add(X, mul(t, ROAD_HALF))), head]);
  } else {
    path = new Path([inboundPoint(d, WORLD - 2), head]);
  }
  routes.set(d, path);
  return path;
}
/** Route distance of queue slot q. */
export const slotR = (q: number) => q * QUEUE_SPACING;
/** Pose at route distance r on approach d (clamped to the route). */
export const routePose = (d: Direction, r: number): PathPose => {
  const route = approachRoute(d);
  return route.at(route.length - r);
};
