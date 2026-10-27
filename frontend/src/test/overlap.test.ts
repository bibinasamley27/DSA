// Replays the recorded engine fixtures through the real presentation pipeline (SimClock + PoseTracker + pedestrians)
// and checks every rendered instant: no two cars intersect, and no crossing pedestrian touches a car.
import { CAR_LEN, ROAD_HALF } from '../lib/geometry';
import { PoseTracker, type Pose } from '../lib/interp';
import { crosserPose, makeCrossers, makeWalkers, stepCrossers, walkerPose } from '../lib/pedestrians';
import { SimClock } from '../lib/simClock';
import type { StateSnapshot } from '../types/simulation';
import balanced from '../fixtures/balanced.json';
import eastSurge from '../fixtures/east_surge.json';
import fairnessTrap from '../fixtures/fairness_trap.json';

const CAR_W = 1.15;
const PED_R = 0.2;
const EPS = 0.05;
const half = (p: Pose) => (Math.abs(Math.sin(p.heading)) > 0.5 ? { x: CAR_LEN / 2, z: CAR_W / 2 } : { x: CAR_W / 2, z: CAR_LEN / 2 });

/** Delivery patterns: [snapshots, ms between them]. */
function deliveries(frames: StateSnapshot[]): [string, StateSnapshot[], number][] {
  return [
    ['1 snapshot/tick @1s', frames, 1000],
    ['2 snapshots/tick @0.5s (live 2 Hz)', frames.flatMap((f) => [f, { ...f }]), 500],
    ['2 ticks/snapshot @0.5s (4x speed)', frames.filter((_, i) => i % 2 === 0).map((f) => ({ ...f, speed: 4 as const })), 500],
  ];
}

function replay(frames: StateSnapshot[], interval: number) {
  const tracker = new PoseTracker();
  const clock = new SimClock();
  const crossers = makeCrossers();
  const walkers = makeWalkers();
  const problems: string[] = [];
  frames.forEach((s, i) => {
    const at = i * interval;
    clock.update(s, 1, at, false);
    tracker.update(s, 1, at, clock.value(at));
    for (let k = 0; k < 12; k++) {
      const now = at + (k / 12) * interval;
      const t = clock.value(now);
      stepCrossers(crossers, s, t);
      const cars = tracker.ids().map((id) => ({ id, p: tracker.sample(id, now, t) })).filter((c): c is { id: number; p: Pose } => !!c.p && c.p.scale > 0.05);
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a]!, B = cars[b]!, ha = half(A.p), hb = half(B.p);
        if (Math.abs(A.p.x - B.p.x) < ha.x + hb.x - EPS && Math.abs(A.p.z - B.p.z) < ha.z + hb.z - EPS)
          problems.push(`tick ${s.tick}: cars ${A.id} and ${B.id} overlap`);
      }
      for (const c of crossers) {
        const p = crosserPose(c, t);
        if (!p.onRoad) continue;
        const vertical = c.arm === 'N' || c.arm === 'S';
        if (s.phase !== 'GREEN' || s.active_direction === null || vertical === (s.active_direction === 'N' || s.active_direction === 'S'))
          problems.push(`tick ${s.tick}: pedestrian on the ${c.arm} crosswalk during ${s.phase} ${s.active_direction}`);
        for (const car of cars) {
          const h = half(car.p);
          if (Math.abs(p.x - car.p.x) < h.x + PED_R && Math.abs(p.z - car.p.z) < h.z + PED_R)
            problems.push(`tick ${s.tick}: pedestrian on ${c.arm} crosswalk touches car ${car.id}`);
        }
      }
      for (const w of walkers) {
        const p = walkerPose(w, t);
        if (Math.min(Math.abs(p.x), Math.abs(p.z)) < ROAD_HALF + 0.3) problems.push(`walker off the sidewalk at ${p.x},${p.z}`);
      }
    }
  });
  return problems;
}

describe.each([
  ['east_surge', eastSurge], ['fairness_trap', fairnessTrap], ['balanced', balanced],
] as const)('%s fixture', (_name, data) => {
  it.each(deliveries(data as unknown as StateSnapshot[]))('%s: no overlaps, safe crossings', (_label, frames, interval) => {
    expect(replay(frames, interval).slice(0, 5)).toEqual([]);
  });
});

it('pedestrians actually cross at some point in the recordings', () => {
  const frames = eastSurge as unknown as StateSnapshot[];
  const clock = new SimClock();
  const crossers = makeCrossers();
  let crossed = 0;
  frames.forEach((s, i) => {
    clock.update(s, 1, i * 1000, false);
    for (let k = 0; k < 4; k++) { stepCrossers(crossers, s, clock.value(i * 1000 + k * 250)); crossed += crossers.filter((c) => c.crossing).length; }
  });
  expect(crossed).toBeGreaterThan(0);
});
