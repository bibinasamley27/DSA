// Replays the recorded engine fixtures through the real presentation pipeline (SimClock + PoseTracker + pedestrians,
// coupled exactly as in Scene.tsx) and checks every sampled instant:
// - no two cars intersect (rotated footprints: cars now turn and drive along side streets),
// - no crossing pedestrian touches a car or walks during a conflicting phase, walkers stay on sidewalks,
// - every car has reached its queue slot by the time the engine reports it crossing (arrivals never lag service).
import { CAR_LEN, ROAD_HALF, vehicleWorldPosition } from '../lib/geometry';
import { PoseTracker, type Pose, type TrackerOptions } from '../lib/interp';
import { crosserPose, crosswalkBusy, makeCrossers, makeWalkers, stepCrossers, walkerPose } from '../lib/pedestrians';
import { SimClock } from '../lib/simClock';
import type { StateSnapshot, VehicleState } from '../types/simulation';
import balanced from '../fixtures/balanced.json';
import eastSurge from '../fixtures/east_surge.json';
import fairnessTrap from '../fixtures/fairness_trap.json';
import emergency from '../fixtures/emergency.json';

const CAR_W = 1.15;
const PED_R = 0.2;
const EPS = 0.05;

/** Separating-axis test for two cars as rotated rectangles (model faces -Z at heading 0). */
function carsOverlap(a: Pose, b: Pose): boolean {
  const axes = (p: Pose) => [{ x: -Math.sin(p.heading), z: -Math.cos(p.heading) }, { x: Math.cos(p.heading), z: -Math.sin(p.heading) }];
  const extent = (p: Pose, ax: { x: number; z: number }) => {
    const [f, s] = axes(p);
    return (CAR_LEN / 2) * Math.abs(f!.x * ax.x + f!.z * ax.z) + (CAR_W / 2) * Math.abs(s!.x * ax.x + s!.z * ax.z);
  };
  for (const ax of [...axes(a), ...axes(b)]) {
    const dist = Math.abs((b.x - a.x) * ax.x + (b.z - a.z) * ax.z);
    if (dist >= extent(a, ax) + extent(b, ax) - EPS) return false;
  }
  return true;
}
function pedTouches(px: number, pz: number, car: Pose): boolean {
  const f = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) }, s = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  const dx = px - car.x, dz = pz - car.z;
  return Math.abs(dx * f.x + dz * f.z) < CAR_LEN / 2 + PED_R && Math.abs(dx * s.x + dz * s.z) < CAR_W / 2 + PED_R;
}

/** Delivery patterns: [snapshots, ms between them]. */
function deliveries(frames: StateSnapshot[]): [string, StateSnapshot[], number][] {
  return [
    ['1 snapshot/tick @1s', frames, 1000],
    ['2 snapshots/tick @0.5s (live 2 Hz)', frames.flatMap((f) => [f, { ...f }]), 500],
    ['2 ticks/snapshot @0.5s (4x speed)', frames.filter((_, i) => i % 2 === 0).map((f) => ({ ...f, speed: 4 as const })), 500],
  ];
}

function replay(frames: StateSnapshot[], interval: number, opts?: TrackerOptions) {
  const tracker = new PoseTracker(opts);
  const clock = new SimClock();
  const crossers = makeCrossers();
  const walkers = makeWalkers();
  tracker.setCrosswalkBusy((arm) => crosswalkBusy(crossers, arm));
  const problems: string[] = [];
  let previous = new Map<number, VehicleState>();
  frames.forEach((s, i) => {
    const at = i * interval;
    clock.update(s, 1, at, false);
    const t0 = clock.value(at);
    // arrivals never lag service: a car the engine now reports CROSSING was at its slot just before
    for (const v of s.vehicles) {
      const was = previous.get(v.id);
      if (v.status !== 'CROSSING' || was?.status !== 'QUEUED') continue;
      const p = tracker.sample(v.id, at, t0);
      const slot = vehicleWorldPosition(was);
      if (p && Math.hypot(p.x - slot.x, p.z - slot.z) > CAR_LEN) problems.push(`tick ${s.tick}: car ${v.id} served before reaching its slot`);
    }
    tracker.update(s, 1, at, t0);
    previous = new Map(s.vehicles.map((v) => [v.id, v]));
    for (let k = 0; k < 12; k++) {
      const now = at + (k / 12) * interval;
      const t = clock.value(now);
      stepCrossers(crossers, s, t, (arm) => tracker.turningInto(arm, now, t));
      const cars = tracker.ids().map((id) => ({ id, p: tracker.sample(id, now, t) })).filter((c): c is { id: number; p: Pose } => !!c.p && c.p.scale > 0.05);
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        if (carsOverlap(cars[a]!.p, cars[b]!.p)) problems.push(`tick ${s.tick}: cars ${cars[a]!.id} and ${cars[b]!.id} overlap`);
      }
      for (const c of crossers) {
        const p = crosserPose(c, t);
        if (!p.onRoad) continue;
        const vertical = c.arm === 'N' || c.arm === 'S';
        // Never on the road while the road it crosses has GREEN or YELLOW. (A pre-emption may cut the perpendicular
        // green short; a pedestrian then finishes during its yellow/all-red, when no conflicting traffic moves.)
        if (s.active_direction !== null && vertical === (s.active_direction === 'N' || s.active_direction === 'S'))
          problems.push(`tick ${s.tick}: pedestrian on the ${c.arm} crosswalk during ${s.phase} ${s.active_direction}`);
        for (const car of cars) if (pedTouches(p.x, p.z, car.p)) problems.push(`tick ${s.tick}: pedestrian on ${c.arm} crosswalk touches car ${car.id}`);
      }
      for (const w of walkers) {
        const p = walkerPose(w, t);
        if (Math.min(Math.abs(p.x), Math.abs(p.z)) < ROAD_HALF + 0.3) problems.push(`walker off the sidewalk at ${p.x},${p.z}`);
      }
    }
  });
  return problems;
}

const FIXTURES = [['east_surge', eastSurge], ['fairness_trap', fairnessTrap], ['balanced', balanced], ['emergency', emergency]] as const;

describe.each(FIXTURES)('%s fixture (decorative turns and side-street exits)', (_name, data) => {
  it.each(deliveries(data as unknown as StateSnapshot[]))('%s: no overlaps, safe crossings, arrivals in time', (_label, frames, interval) => {
    expect(replay(frames, interval).slice(0, 5)).toEqual([]);
  });
});

describe.each(FIXTURES)('%s fixture, worst cases', (_name, data) => {
  const frames = data as unknown as StateSnapshot[];
  const cases: [string, TrackerOptions][] = [
    ['every car turns left', { turnFor: () => 'L', offRampFor: () => false }],
    ['every car turns right onto a side street', { turnFor: () => 'R', offRampFor: () => true }],
    ['every car goes straight', { turnFor: () => 'S', offRampFor: () => false }],
  ];
  it.each(cases)('%s: no overlaps, safe crossings', (_l, opts) => {
    expect(replay(frames.flatMap((f) => [f, { ...f }]), 500, opts).slice(0, 5)).toEqual([]);
  });
});

it('pedestrians still get to cross with turning traffic around', () => {
  const frames = eastSurge as unknown as StateSnapshot[];
  const tracker = new PoseTracker();
  const clock = new SimClock();
  const crossers = makeCrossers();
  tracker.setCrosswalkBusy((arm) => crosswalkBusy(crossers, arm));
  let crossed = 0;
  frames.forEach((s, i) => {
    clock.update(s, 1, i * 1000, false);
    tracker.update(s, 1, i * 1000, clock.value(i * 1000));
    for (let k = 0; k < 4; k++) {
      const now = i * 1000 + k * 250, t = clock.value(now);
      stepCrossers(crossers, s, t, (arm) => tracker.turningInto(arm, now, t));
      crossed += crossers.filter((c) => c.crossing).length;
    }
  });
  expect(crossed).toBeGreaterThan(0);
});
