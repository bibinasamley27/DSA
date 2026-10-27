// Presentation-only motion between accepted snapshots. Every rendered car is a vehicle the server reported
// (or one that just left it); nothing is spawned locally and nothing changes simulation data.
// - QUEUED cars drive in along the road to their reported slot, within a time budget that ends before the engine
//   could serve them (one departure per green tick), then follow their slot.
// - CROSSING cars move along their junction path to the midpoint (path_progress 0.5).
// - Within a run a vehicle only leaves `vehicles` by exiting, so a vanished car drives on along its exit path.
// Turns are decorative (ADR 0002); a turn that would cut through an occupied crosswalk becomes straight-through.
import type { Direction, StateSnapshot, VehicleState } from '../types/simulation';
import { CAR_LEN, LANE_W, OUTWARD, QUEUE_SPACING, STOP, vehicleWorldPosition } from './geometry';
import { approachRoute, junctionPath, Path, rightOf, routePose, slotR, travel, type Turn } from './paths';

export interface Pose { x: number; z: number; heading: number; scale: number }

type Motion =
  | { kind: 'lerp'; from: Pose; to: Pose }
  | { kind: 'enter'; r0: number; rEnd: number; clock0: number; dur: number } // along the approach route
  | { kind: 'cross'; path: Path; d0: number; d1: number; t0: number; win: number }
  | { kind: 'exit'; path: Path; d0: number; clock0: number };
interface Track { motion: Motion; bornAt: number; vehicle: VehicleState; arm: Direction | null; turn: Turn | null }

/**
 * Closest a car on an approach may follow the car ahead, along the route. Equal to the queue spacing; on the tightest
 * curve (radius ROAD_HALF) it still keeps centres 2.37 apart, more than two cars' half-diagonals (2.24), so rotated
 * cars cannot touch while turning in from a side street.
 */
export const FOLLOW_GAP = QUEUE_SPACING;
export const MIN_WINDOW_MS = 120;
export const MAX_WINDOW_MS = 1200;
export const SPAWN_MS = 300;
/** Departed vehicles drive off at this speed (world units per simulation tick). */
export const EXIT_SPEED = 8;
/** Drive-in speed budget (world units per tick of the entry time). */
export const ENTRY_SPEED = 14;
/** Entry time for queue position q: always shorter than the q+1 ticks before the engine can serve that car. */
export const entryTicks = (q: number) => Math.min(6, 0.4 + 0.9 * q);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
type Placement = Pick<VehicleState, 'direction' | 'status' | 'path_progress' | 'queue_position'>;
const pose = (v: Placement): Pose => ({ ...vehicleWorldPosition(v), scale: 1 });
const EXIT_EASE = 0.25; // ticks to reach EXIT_SPEED; short so the next car (which may get only a 0.5 s window) never closes in
export const exitDistance = (e: number) => (e < EXIT_EASE ? (EXIT_SPEED * e * e) / (2 * EXIT_EASE) : EXIT_SPEED * (e - EXIT_EASE / 2));

function mix(id: number, salt: number) {
  let h = Math.imul(id ^ salt, 2654435761) >>> 0;
  h ^= h >>> 15;
  return Math.imul(h, 2246822519) >>> 0;
}
/** Default decorative choice: about 25% left, 25% right, 50% straight; half of all cars turn off onto a side street. */
export const defaultTurn = (id: number): Turn => (['L', 'R', 'S', 'S'] as const)[mix(id, 0x51) % 4]!;
export const defaultOffRamp = (id: number) => mix(id, 0x77) % 2 === 0;
export const isSupercar = (id: number) => mix(id, 0x5c) % 9 === 0;

export interface TrackerOptions {
  turnFor?: (id: number) => Turn;
  offRampFor?: (id: number) => boolean;
}

export class PoseTracker {
  private tracks = new Map<number, Track>();
  private startedAt = 0;
  private windowMs = MAX_WINDOW_MS;
  private lastReceived = -1;
  private epoch = -1;
  private last: StateSnapshot | null = null;
  private heldAt: number | null = null;
  private offset = 0; // total wall time spent held, so animations resume exactly where they froze
  private busy: (arm: Direction) => boolean = () => false;
  private turnFor: (id: number) => Turn;
  private offRampFor: (id: number) => boolean;
  private frameNow = NaN;
  private frameClock = NaN;
  private frame = new Map<number, Pose | null>();
  private frameR = new Map<number, number>();

  constructor(opts: TrackerOptions = {}) {
    this.turnFor = opts.turnFor ?? defaultTurn;
    this.offRampFor = opts.offRampFor ?? defaultOffRamp;
  }

  /** Pedestrian hook: true while someone is crossing the crosswalk of `arm`. */
  setCrosswalkBusy(fn: (arm: Direction) => boolean) { this.busy = fn; }

  /** While stale (disconnected), freeze every wall-clock animation at `at`. */
  hold(at: number) { if (this.heldAt === null) this.heldAt = at; }
  /** Resume after `hold`, continuing from the frozen poses. */
  resume(now: number) {
    if (this.heldAt === null) return;
    this.offset += now - this.heldAt;
    this.heldAt = null;
  }
  private eff(now: number) { return (this.heldAt ?? now) - this.offset; }

  private decide(v: VehicleState): { turn: Turn; arm: Direction; jp: ReturnType<typeof junctionPath> } {
    let turn = v.kind === 'ambulance' ? 'S' : this.turnFor(v.id); // ambulances go straight through: easy to follow
    let jp = junctionPath(v.direction, turn, this.offRampFor(v.id));
    if (turn !== 'S' && this.busy(jp.arm)) {
      turn = 'S';
      jp = junctionPath(v.direction, 'S', this.offRampFor(v.id));
    }
    return { turn, arm: jp.arm, jp };
  }

  /** Path for a car at `at` heading into the junction: prepend its current point if it is not at the path start yet. */
  private joinPath(jp: ReturnType<typeof junctionPath>, at: Pose | null) {
    const start = jp.path.at(0);
    if (!at || Math.hypot(at.x - start.x, at.z - start.z) < 0.05) return { path: jp.path, shift: 0 };
    const path = jp.path.from(at);
    return { path, shift: path.length - jp.path.length };
  }

  /**
   * Call once per accepted snapshot (repeat calls with the same snapshot are no-ops). `clock` is SimClock time at
   * `receivedAt`. A new epoch (new run) drops every track: no cross-run blending.
   */
  update(s: StateSnapshot, runEpoch: number, receivedAt: number, clock: number) {
    if (s === this.last) return;
    this.last = s;
    if (runEpoch !== this.epoch) {
      this.tracks.clear();
      this.epoch = runEpoch;
      this.lastReceived = -1;
    }
    const now = this.eff(receivedAt);
    this.solve(now, clock);
    const interval = this.lastReceived >= 0 ? now - this.lastReceived : MAX_WINDOW_MS;
    const win = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, interval));
    const next = new Map<number, Track>();

    for (const v of s.vehicles) {
      const old = this.tracks.get(v.id);
      const cur = old && old.motion.kind !== 'exit' ? this.frame.get(v.id) ?? null : null;
      const bornAt = old ? old.bornAt : now;
      if (v.status === 'QUEUED') {
        const to = pose(v);
        const rEnd = slotR(v.queue_position);
        if (!old) {
          const dur = entryTicks(v.queue_position);
          const r0 = Math.min(approachRoute(v.direction).length, rEnd + ENTRY_SPEED * dur);
          next.set(v.id, { motion: { kind: 'enter', r0, rEnd, clock0: clock, dur }, bornAt, vehicle: v, arm: null, turn: null });
        } else if (old.motion.kind === 'enter' && clock < old.motion.clock0 + old.motion.dur) {
          // still driving in: continue from where it is shown, retarget to the (possibly advanced) slot
          const m = old.motion;
          const r0 = this.frameR.get(v.id) ?? m.rEnd;
          next.set(v.id, { ...old, vehicle: v, motion: { kind: 'enter', r0, rEnd, clock0: clock, dur: Math.max(0.3, m.clock0 + m.dur - clock) } });
        } else {
          next.set(v.id, { motion: { kind: 'lerp', from: cur ?? to, to }, bornAt, vehicle: v, arm: null, turn: null });
        }
      } else {
        if (old?.motion.kind === 'cross') { next.set(v.id, { ...old, vehicle: v }); continue; } // repeated state: keep animating
        const { turn, arm, jp } = this.decide(v);
        const from = cur ?? { ...pose({ ...v, status: 'QUEUED', path_progress: 0, queue_position: 2 }), scale: 1 }; // immediate service
        const { path, shift } = this.joinPath(jp, from);
        next.set(v.id, { motion: { kind: 'cross', path, d0: 0, d1: jp.checkpoint + shift, t0: now, win }, bornAt, vehicle: v, arm, turn });
      }
    }

    this.tracks.forEach((t, id) => {
      if (next.has(id)) return;
      if (t.motion.kind === 'exit') {
        if (this.sampleAt(t, now, clock)) next.set(id, t); // still on the map
        return;
      }
      const cur = this.frame.get(id) ?? null;
      if (!cur) return;
      if (t.motion.kind === 'cross') {
        const m = t.motion;
        const d = m.d0 + (m.d1 - m.d0) * smooth(clamp01((now - m.t0) / m.win));
        next.set(id, { ...t, motion: { kind: 'exit', path: m.path, d0: d, clock0: clock } });
        return;
      }
      const { turn, arm, jp } = this.decide(t.vehicle); // left while queued (e.g. two ticks per snapshot at 4x)
      const { path } = this.joinPath(jp, cur);
      next.set(id, { ...t, arm, turn, motion: { kind: 'exit', path, d0: 0, clock0: clock } });
    });

    this.tracks = next;
    this.frameNow = NaN; // invalidate the per-frame cache
    this.startedAt = now;
    this.windowMs = win;
    this.lastReceived = now;
  }

  ids(): number[] { return [...this.tracks.keys()]; }
  kindOf(id: number): VehicleState['kind'] { return this.tracks.get(id)?.vehicle.kind ?? 'car'; }

  /**
   * True while a car turning into `arm` has not yet cleared that arm's crosswalk, so a pedestrian must not step out.
   * (Straight-through cars never cross a crosswalk that pedestrians may use under the signal-gated crossing rule.)
   */
  turningInto(arm: Direction, wallNow: number, clock: number): boolean {
    const now = this.eff(wallNow);
    for (const t of this.tracks.values()) {
      if (t.arm !== arm || t.turn === 'S' || t.turn === null) continue;
      const p = this.sampleAt(t, now, clock);
      if (p && p.x * OUTWARD[arm].x + p.z * OUTWARD[arm].z < STOP + CAR_LEN / 2 + 0.3) return true;
    }
    return false;
  }

  sample(id: number, wallNow: number, clock: number): Pose | null {
    this.solve(this.eff(wallNow), clock);
    return this.frame.get(id) ?? null;
  }

  /**
   * All poses for one instant (cached per frame), with lane following applied: on each approach route a queued car
   * (shuffling or still driving in) never gets closer than FOLLOW_GAP to the car ahead of it in the engine's FIFO
   * order (crossing cars first, then by queue_position). It is only ever held back.
   */
  private solve(now: number, clock: number) {
    if (now === this.frameNow && clock === this.frameClock) return;
    this.frameNow = now; this.frameClock = clock;
    this.frame = new Map();
    this.frameR = new Map();
    const lanes = new Map<Direction, { id: number; r: number; order: number; follower: boolean }[]>();
    const head = STOP + CAR_LEN / 2;
    for (const [id, t] of this.tracks) {
      const p = this.sampleAt(t, now, clock);
      this.frame.set(id, p);
      if (!p) continue;
      const d = t.vehicle.direction;
      let r: number;
      if (t.motion.kind === 'enter') {
        const m = t.motion;
        r = m.rEnd + (m.r0 - m.rEnd) * (1 - easeOut(clamp01((clock - m.clock0) / m.dur)));
      } else {
        const o = OUTWARD[d], side = rightOf(travel(d));
        if (Math.abs(p.x * side.x + p.z * side.z - LANE_W / 2) > 0.5) continue; // turning inside the junction
        r = p.x * o.x + p.z * o.z - head;
        if (r < -2 * head) continue;                                           // past the junction
      }
      const list = lanes.get(d) ?? [];
      const follower = t.motion.kind === 'lerp' || t.motion.kind === 'enter';
      // engine FIFO: departed cars still on the approach first, then crossing, then the queue in order
      list.push({ id, r, order: follower ? t.vehicle.queue_position : t.motion.kind === 'exit' ? -2 : -1, follower });
      lanes.set(d, list);
    }
    for (const [d, list] of lanes) {
      list.sort((x, y) => x.order - y.order || x.r - y.r); // never by current position, so nobody can overtake
      for (let i = 0; i < list.length; i++) {
        const me = list[i]!, lead = list[i - 1];
        if (lead && me.follower && me.r < lead.r + FOLLOW_GAP) {
          me.r = lead.r + FOLLOW_GAP;
          const p = this.frame.get(me.id)!;
          this.frame.set(me.id, { ...routePose(d, me.r), scale: p.scale });
        }
        this.frameR.set(me.id, me.r);
      }
    }
  }

  private sampleAt(t: Track, now: number, clock: number): Pose | null {
    const m = t.motion;
    const scale = smooth(clamp01((now - t.bornAt) / SPAWN_MS));
    switch (m.kind) {
      case 'lerp': {
        const k = smooth(clamp01((now - this.startedAt) / this.windowMs));
        return { x: lerp(m.from.x, m.to.x, k), z: lerp(m.from.z, m.to.z, k), heading: m.to.heading, scale };
      }
      case 'enter': {
        const r = m.rEnd + (m.r0 - m.rEnd) * (1 - easeOut(clamp01((clock - m.clock0) / m.dur)));
        return { ...routePose(t.vehicle.direction, r), scale };
      }
      case 'cross': {
        const d = m.d0 + (m.d1 - m.d0) * smooth(clamp01((now - m.t0) / m.win));
        return { ...m.path.at(d), scale };
      }
      case 'exit': {
        const d = m.d0 + exitDistance(Math.max(0, clock - m.clock0));
        return d >= m.path.length ? null : { ...m.path.at(d), scale: 1 };
      }
    }
  }

  clear() { this.tracks.clear(); this.epoch = -1; this.last = null; this.heldAt = null; this.offset = 0; }
}
