import { CAR_LEN, QUEUE_SPACING, STOP, axialOffset, signalPlacement, vehicleWorldPosition } from '../lib/geometry';
import { lampFor } from '../lib/signal';
import { ENTRY_SPEED, entryTicks, exitDistance, PoseTracker } from '../lib/interp';
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
  const straight = { turnFor: () => 'S' as const, offRampFor: () => false };
  const veh = (id: number, q: number, status: 'QUEUED' | 'CROSSING' = 'QUEUED', direction: Direction = 'N') =>
    ({ id, direction, status, arrival_tick: 0, path_progress: status === 'CROSSING' ? 0.5 : 0, queue_position: q, kind: 'car' as const });
  const snap = (tick: number, vehicles: ReturnType<typeof veh>[]) => frame(5, { tick, vehicles });

  it('drives a new car in along its road and reaches the slot within its entry budget', () => {
    const t = new PoseTracker(straight);
    t.update(snap(1, [veh(1, 3)]), 1, 0, 1);
    const slot = vehicleWorldPosition({ direction: 'N', status: 'QUEUED', path_progress: 0, queue_position: 3 });
    const start = t.sample(1, 0, 1)!;
    expect(slot.z - start.z).toBeCloseTo(ENTRY_SPEED * entryTicks(3));   // N road runs toward -z
    expect(t.sample(1, 0, 1 + entryTicks(3))!.z).toBeCloseTo(slot.z);
    expect(t.sample(1, 0, 99)!.z).toBeCloseTo(slot.z);                  // stays put; no extrapolation
  });
  it('gives the head of the queue less than one tick to arrive (the engine may serve it next tick)', () => {
    expect(entryTicks(0)).toBeLessThan(0.5);
    for (let q = 1; q < 15; q++) expect(entryTicks(q)).toBeLessThan(q + 0.5);
  });
  it('moves a crossing car to the junction midpoint and holds there', () => {
    const t = new PoseTracker(straight);
    t.update(snap(1, [veh(1, 0)]), 1, 0, 1);
    t.update(snap(2, [veh(1, 0, 'CROSSING')]), 1, 1000, 2);
    const end = t.sample(1, 2000, 2)!;
    expect(Math.hypot(end.x - -1.1, end.z)).toBeLessThan(0.05);         // N lane line, junction centre
    expect(t.sample(1, 60_000, 2)).toEqual(end);
  });
  it('turns a left-turning car through the junction onto the East exit lane', () => {
    const t = new PoseTracker({ turnFor: () => 'L', offRampFor: () => false });
    t.update(snap(1, [veh(1, 0)]), 1, 0, 1);
    t.update(snap(2, [veh(1, 0, 'CROSSING')]), 1, 1000, 2);
    t.update(snap(3, []), 1, 2000, 3);
    const out = t.sample(1, 2000, 6)!;
    expect(out.x).toBeGreaterThan(STOP);                                 // on the East arm
    expect(out.z).toBeCloseTo(1.1);                                      // outbound (eastbound) lane
    expect(Math.abs(Math.sin(out.heading))).toBeCloseTo(1);              // heading along x
  });
  it('goes straight instead of turning through a crosswalk with someone on it', () => {
    const t = new PoseTracker({ turnFor: () => 'R', offRampFor: () => false });
    t.setCrosswalkBusy((arm) => arm === 'W');                            // N right turn exits through W
    t.update(snap(1, [veh(1, 0)]), 1, 0, 1);
    t.update(snap(2, [veh(1, 0, 'CROSSING')]), 1, 1000, 2);
    t.update(snap(3, []), 1, 2000, 3);
    const out = t.sample(1, 2000, 6)!;
    expect(out.x).toBeCloseTo(-1.1);                                     // still on the N-S line, heading south
    expect(out.z).toBeGreaterThan(STOP);
    expect(t.turningInto('W', 2000, 6)).toBe(false);
  });
  it('reports a turning car to pedestrians until it has cleared the crosswalk', () => {
    const t = new PoseTracker({ turnFor: () => 'R', offRampFor: () => false });
    t.update(snap(1, [veh(1, 0)]), 1, 0, 1);
    t.update(snap(2, [veh(1, 0, 'CROSSING')]), 1, 1000, 2);
    expect(t.turningInto('W', 1000, 2)).toBe(true);
    t.update(snap(3, []), 1, 2000, 3);
    expect(t.turningInto('W', 2000, 6)).toBe(false);                     // long gone
  });
  it('drives a departed car to the end of its road on simulation time, then drops it', () => {
    const t = new PoseTracker(straight);
    t.update(snap(1, [veh(1, 0, 'CROSSING')]), 1, 0, 1);
    t.update(snap(2, []), 1, 1000, 2);
    const start = t.sample(1, 1000, 2)!;
    expect(t.sample(1, 99_999, 2)).toEqual(start);                       // clock frozen (paused): no movement
    expect(t.sample(1, 1000, 4)!.z - start.z).toBeCloseTo(exitDistance(2));
    expect(t.sample(1, 1000, 100)).toBeNull();
    t.update(snap(3, []), 1, 2000, 100);
    expect(t.ids()).toEqual([]);
  });
  it('can leave via a side street', () => {
    const t = new PoseTracker({ turnFor: () => 'S', offRampFor: () => true });
    t.update(snap(1, [veh(1, 0, 'CROSSING')]), 1, 0, 1);
    t.update(snap(2, []), 1, 1000, 2);
    const far = t.sample(1, 1000, 2 + 12)!;                              // ~94 units later: past the corner at 58
    expect(far.z).toBeCloseTo(58 - 1.1, 0);                              // westbound side-street lane
    expect(far.x).toBeLessThan(-5);
  });
  it('does not blend or animate exits across runs', () => {
    const t = new PoseTracker(straight);
    t.update(snap(1, [veh(1, 0, 'CROSSING')]), 1, 0, 1);
    t.update(snap(0, []), 2, 500, 0);
    expect(t.ids()).toEqual([]);
  });
  it('freezes while held (stale) and resumes from the frozen pose', () => {
    const t = new PoseTracker(straight);
    t.update(snap(1, [veh(1, 0)]), 1, 0, 1);
    t.update(snap(2, [veh(1, 0, 'CROSSING')]), 1, 1000, 2);
    t.hold(1250);
    const frozen = t.sample(1, 1250, 2)!;
    expect(t.sample(1, 9000, 2)).toEqual(frozen);
    t.resume(9000);
    expect(t.sample(1, 9000, 2)).toEqual(frozen);
    t.update(snap(3, [veh(1, 0, 'CROSSING')]), 1, 9000, 3);              // repeated state keeps the same animation
    expect(t.sample(1, 9000, 3)!.z).toBeCloseTo(frozen.z);
  });
  it('is idempotent per snapshot and copes with 60 vehicles', () => {
    const t = new PoseTracker();
    const s = snap(1, Array.from({ length: 60 }, (_, i) => veh(i + 1, i % 15, 'QUEUED', (['N', 'E', 'S', 'W'] as const)[i % 4]!)));
    t.update(s, 1, 0, 1);
    t.update(s, 1, 400, 1);
    expect(t.ids()).toHaveLength(60);
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
