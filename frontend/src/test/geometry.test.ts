import { CAR_LEN, QUEUE_SPACING, STOP, axialOffset, signalPlacement, vehicleWorldPosition } from '../lib/geometry';
import { lampFor } from '../lib/signal';
import { ENTRY_SLOTS, exitDistance, PoseTracker } from '../lib/interp';
import { SimClock } from '../lib/simClock';
import { frame } from './helpers';
import type { Direction } from '../types/simulation';

const q = (direction: Direction, queue_position: number, path_progress = 0, status: 'QUEUED' | 'CROSSING' = 'QUEUED') =>
  ({ direction, queue_position, path_progress, status });

describe('coordinate mapping', () => {
  it('places each approach on its own side of the centre', () => {
    expect(vehicleWorldPosition(q('N', 0)).z).toBeLessThan(0);
    expect(vehicleWorldPosition(q('S', 0)).z).toBeGreaterThan(0);
    expect(vehicleWorldPosition(q('E', 0)).x).toBeGreaterThan(0);
    expect(vehicleWorldPosition(q('W', 0)).x).toBeLessThan(0);
  });
  it('right-hand lanes: N inbound is west of the axis, E inbound is north', () => {
    expect(vehicleWorldPosition(q('N', 0)).x).toBeLessThan(0);
    expect(vehicleWorldPosition(q('E', 0)).z).toBeLessThan(0);
  });
  it('queue position steps back by one slot', () => {
    expect(axialOffset(q('N', 0)) - axialOffset(q('N', 3))).toBeCloseTo(3 * QUEUE_SPACING);
    expect(axialOffset(q('N', 0))).toBeCloseTo(-STOP - CAR_LEN / 2);
  });
  it('path progress moves monotonically through the junction', () => {
    const at = (p: number) => axialOffset(q('N', 0, p, 'CROSSING'));
    expect(at(0.5)).toBeGreaterThan(at(0));
    expect(at(1)).toBeGreaterThan(STOP - 1);
    expect(Math.abs(at(0.5))).toBeLessThan(CAR_LEN);
  });
  it('is deterministic', () => {
    expect(vehicleWorldPosition(q('W', 2, 0.5, 'CROSSING'))).toEqual(vehicleWorldPosition(q('W', 2, 0.5, 'CROSSING')));
  });
});

describe('signalPlacement', () => {
  it.each(['N', 'E', 'S', 'W'] as const)('%s head is far-side over its own lane, faces the whole queue, pole on the far-right kerb', (d) => {
    const s = signalPlacement(d);
    const front = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) }; // local +Z after rotation about Y
    const first = vehicleWorldPosition({ direction: d, status: 'QUEUED', path_progress: 0, queue_position: 0 });
    for (const q of [0, 5, 14]) {
      const car = vehicleWorldPosition({ direction: d, status: 'QUEUED', path_progress: 0, queue_position: q });
      const toCar = { x: car.x - s.head.x, z: car.z - s.head.z };
      const dist = Math.hypot(toCar.x, toCar.z);
      // the queue lies straight ahead of the head's face (same lane line), so every car sees it head-on
      expect((front.x * toCar.x + front.z * toCar.z) / dist).toBeGreaterThan(0.999);
    }
    // beyond the junction centre (far side), not beside the first car
    expect(Math.hypot(s.head.x - first.x, s.head.z - first.z)).toBeGreaterThan(2 * STOP);
    // pole is on the driver's right: travel direction rotated -90° about Y; car heading 0 faces -Z
    const travel = { x: -Math.sin(first.heading), z: -Math.cos(first.heading) };
    const right = { x: -travel.z, z: travel.x };
    expect(right.x * (s.pole.x - s.head.x) + right.z * (s.pole.z - s.head.z)).toBeGreaterThan(0);
  });
});

describe('lampFor', () => {
  it('mirrors phase and active direction exactly', () => {
    expect(lampFor('N', { phase: 'GREEN', active_direction: 'N' })).toBe('green');
    expect(lampFor('N', { phase: 'YELLOW', active_direction: 'N' })).toBe('yellow');
    expect(lampFor('E', { phase: 'GREEN', active_direction: 'N' })).toBe('red');
    expect(lampFor('N', { phase: 'ALL_RED', active_direction: null })).toBe('red');
    expect(lampFor('N', null)).toBeNull();
  });
});

describe('PoseTracker', () => {
  const withVehicles = (n: number, tick: number, progress = 0) => frame(5, {
    tick, vehicles: Array.from({ length: n }, (_, i) => ({ id: i + 1, direction: 'N' as const, status: 'QUEUED' as const, arrival_tick: 0, path_progress: progress, queue_position: i })),
  });
  const crossingN = (tick: number) => ({ ...withVehicles(1, tick), vehicles: [{ ...withVehicles(1, tick).vehicles[0]!, status: 'CROSSING' as const, path_progress: 0.5 }] });

  it('interpolates to the new target and holds there (no extrapolation)', () => {
    const t = new PoseTracker();
    t.update(withVehicles(1, 1, 0), 1, 0, 1);
    t.update(crossingN(2), 1, 500, 2);
    const from = t.sample(1, 500, 2)!;
    const mid = t.sample(1, 750, 2)!;
    const end = t.sample(1, 1000, 2)!;
    const later = t.sample(1, 60_000, 2)!;
    expect(from.z).toBeLessThan(mid.z);
    expect(mid.z).toBeLessThan(end.z);
    expect(later).toEqual(end);
  });
  it('new vehicles enter from behind their slot, not on it', () => {
    const t = new PoseTracker();
    t.update(withVehicles(1, 1), 1, 0, 1);
    const slot = vehicleWorldPosition({ direction: 'N', status: 'QUEUED', path_progress: 0, queue_position: 0 });
    expect(t.sample(1, 0, 1)!.z).toBeCloseTo(slot.z - ENTRY_SLOTS * QUEUE_SPACING); // N queue extends toward -z
    expect(t.sample(1, 5000, 1)!.z).toBeCloseTo(slot.z);
  });
  it('does not blend across runs', () => {
    const t = new PoseTracker();
    t.update(withVehicles(1, 1, 0), 1, 0, 1);
    t.update(crossingN(1), 2, 400, 1);
    expect(t.ids()).toEqual([1]);
    expect(t.sample(1, 400, 1)!.z).toBeLessThan(-STOP); // fresh entry from behind the stop line, not a blend from the old run
  });
  it('drives a departed vehicle on to the end of its outbound road using simulation time, then drops it', () => {
    const t = new PoseTracker();
    t.update(crossingN(1), 1, 0, 1);
    t.update(withVehicles(0, 2), 1, 1000, 2);
    expect(t.ids()).toEqual([1]);
    const start = t.sample(1, 1000, 2)!;
    expect(t.sample(1, 99_999, 2)).toEqual(start);                     // clock frozen (paused): no movement
    const later = t.sample(1, 1000, 4)!;
    expect(later.z - start.z).toBeCloseTo(exitDistance(2));             // N traffic heads south (+z)
    expect(later.x).toBeCloseTo(start.x);
    expect(t.sample(1, 1000, 100)).toBeNull();                          // past the world edge
    t.update(withVehicles(0, 3), 1, 2000, 100);
    expect(t.ids()).toEqual([]);                                        // pruned
  });
  it('does not animate exits across a new run', () => {
    const t = new PoseTracker();
    t.update(crossingN(1), 1, 0, 1);
    t.update(withVehicles(0, 0), 2, 500, 0);
    expect(t.ids()).toEqual([]);
  });
  it('scales new vehicles in and is idempotent per snapshot', () => {
    const t = new PoseTracker();
    const s = withVehicles(1, 1);
    t.update(s, 1, 0, 1);
    t.update(s, 1, 400, 1); // same snapshot object: ignored
    expect(t.sample(1, 0, 1)!.scale).toBe(0);
    expect(t.sample(1, 1000, 1)!.scale).toBe(1);
  });
  it('copes with 60 vehicles', () => {
    const t = new PoseTracker();
    t.update(withVehicles(60, 1), 1, 0, 1);
    expect(t.sample(60, 10, 1)).not.toBeNull();
  });
});

describe('SimClock', () => {
  const at = (tick: number, sim_status: 'running' | 'paused' = 'running', speed: 1 | 4 = 1) => frame(5, { tick, sim_status, speed });
  it('advances smoothly while running, never more than one snapshot step ahead', () => {
    const c = new SimClock();
    c.update(at(10), 1, 0, false);
    expect(c.value(500)).toBeCloseTo(10.5);
    expect(c.value(5000)).toBeCloseTo(10.95);
  });
  it('freezes when paused or stale and stays monotonic', () => {
    const c = new SimClock();
    c.update(at(10), 1, 0, false);
    const v = c.value(600);
    c.update(at(10, 'paused'), 1, 700, false);
    expect(c.value(9000)).toBe(v);
    c.update(at(11, 'paused'), 1, 9100, false); // a step
    expect(c.value(9200)).toBe(11);
    c.update(at(12), 1, 9300, true);             // stale
    expect(c.value(20_000)).toBe(12);
  });
  it('allows a two-tick step at 4x with 2 Hz snapshots, and restarts on a new run', () => {
    const c = new SimClock();
    c.update(at(10, 'running', 4), 1, 0, false);
    c.update(at(12, 'running', 4), 1, 500, false);
    expect(c.value(900)).toBeCloseTo(13.6);
    c.update(at(0), 2, 1000, false);
    expect(c.value(1000)).toBe(0);
  });
});
