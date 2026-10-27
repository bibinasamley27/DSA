// Presentation-only smoothing between accepted snapshots. Never extrapolates a live vehicle past its latest target.
import type { StateSnapshot, VehicleState } from '../types/simulation';
import { vehicleWorldPosition, WORLD } from './geometry';

export interface Pose { x: number; z: number; heading: number; scale: number }
interface Exit { from: Pose; dir: { x: number; z: number }; clock0: number }
interface Track { from: Pose; to: Pose; bornAt: number; vehicle: VehicleState; exit: Exit | null }

export const MIN_WINDOW_MS = 120;
export const MAX_WINDOW_MS = 1200;
export const SPAWN_MS = 300;
/** Departed vehicles drive off along their outbound lane at this speed (world units per simulation tick). */
export const EXIT_SPEED = 8;
/** New vehicles enter from this many queue slots behind their reported slot, never on top of the car ahead. */
export const ENTRY_SLOTS = 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
type Placement = Pick<VehicleState, 'direction' | 'status' | 'path_progress' | 'queue_position'>;
const pose = (v: Placement): Pose => ({ ...vehicleWorldPosition(v), scale: 1 });
/** Where a vehicle first seen in `v`'s state starts its approach: behind its slot (or behind the stop line if already crossing). */
const entryPose = (v: VehicleState): Pose =>
  pose({ direction: v.direction, status: 'QUEUED', path_progress: 0, queue_position: (v.status === 'QUEUED' ? v.queue_position : 0) + ENTRY_SLOTS });
const EXIT_EASE = 0.25; // ticks to reach EXIT_SPEED; short so the next car (which may get only a 0.5 s window) never closes in
/** Distance travelled after `e` ticks: brief ease-in, then constant EXIT_SPEED. */
export const exitDistance = (e: number) => (e < EXIT_EASE ? (EXIT_SPEED * e * e) / (2 * EXIT_EASE) : EXIT_SPEED * (e - EXIT_EASE / 2));

export class PoseTracker {
  private tracks = new Map<number, Track>();
  private startedAt = 0;
  private windowMs = MAX_WINDOW_MS;
  private lastReceived = -1;
  private epoch = -1;
  private last: StateSnapshot | null = null;

  /**
   * Call once per accepted snapshot (repeat calls with the same snapshot are no-ops). `clock` is SimClock time at `receivedAt`.
   * A new epoch (new run) drops every track: no cross-run blending.
   * Within a run, a vehicle can only leave `vehicles` by exiting (backend contract), so a vanished vehicle drives on
   * through the junction and off to the end of its outbound road (presentation only; metrics are untouched).
   */
  update(s: StateSnapshot, runEpoch: number, receivedAt: number, clock: number) {
    if (s === this.last) return;
    this.last = s;
    if (runEpoch !== this.epoch) {
      this.tracks.clear();
      this.epoch = runEpoch;
      this.lastReceived = -1;
    }
    const interval = this.lastReceived >= 0 ? receivedAt - this.lastReceived : MAX_WINDOW_MS;
    const next = new Map<number, Track>();
    for (const v of s.vehicles) {
      const old = this.tracks.get(v.id);
      const live = old && !old.exit ? old : undefined;
      const to = pose(v);
      const from = live ? this.sample(v.id, receivedAt, clock) : null;
      next.set(v.id, { from: from ?? entryPose(v), to, bornAt: live ? live.bornAt : receivedAt, exit: null, vehicle: v });
    }
    this.tracks.forEach((t, id) => {
      if (next.has(id)) return;
      const at = this.sample(id, receivedAt, clock);
      if (!at) return; // already off the map
      if (t.exit) { next.set(id, t); return; }
      const dir = { x: -Math.sin(at.heading), z: -Math.cos(at.heading) }; // car model faces -Z at heading 0
      next.set(id, { ...t, exit: { from: { ...at, scale: 1 }, dir, clock0: clock } });
    });
    this.tracks = next;
    this.startedAt = receivedAt;
    this.windowMs = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, interval));
    this.lastReceived = receivedAt;
  }

  ids(): number[] { return [...this.tracks.keys()]; }

  sample(id: number, now: number, clock: number): Pose | null {
    const t = this.tracks.get(id);
    if (!t) return null;
    if (t.exit) {
      const d = exitDistance(Math.max(0, clock - t.exit.clock0));
      const x = t.exit.from.x + t.exit.dir.x * d, z = t.exit.from.z + t.exit.dir.z * d;
      return Math.abs(x) > WORLD || Math.abs(z) > WORLD ? null : { x, z, heading: t.exit.from.heading, scale: 1 };
    }
    const k = smooth(clamp01((now - this.startedAt) / this.windowMs));
    const scale = smooth(clamp01((now - t.bornAt) / SPAWN_MS));
    return { x: lerp(t.from.x, t.to.x, k), z: lerp(t.from.z, t.to.z, k), heading: t.to.heading, scale };
  }

  clear() { this.tracks.clear(); this.epoch = -1; this.last = null; }
}
