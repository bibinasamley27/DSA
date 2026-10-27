// Deterministic mapping from protocol fields to Three.js world coordinates.
// World: +x = east, +z = south (toward the camera), +y = up. Units are arbitrary "metres".
import type { Direction, VehicleState } from '../types/simulation';

export const LANE_W = 2.2;
export const ROAD_HALF = LANE_W;          // one inbound + one outbound lane per road
export const STOP = ROAD_HALF + 2.2;      // stop line distance from centre (crosswalk sits between)
export const SIDEWALK_W = 2.4;
export const ARM = 40;                    // road length from centre (a full 15-car queue fits)
export const CAR_LEN = 1.9;
export const CAR_GAP = 0.6;
export const QUEUE_SPACING = CAR_LEN + CAR_GAP;

/** Unit vector pointing from the junction centre out along approach `d`. */
export const OUTWARD: Record<Direction, { x: number; z: number }> = {
  N: { x: 0, z: -1 }, E: { x: 1, z: 0 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 },
};

/** Heading (rotation about Y) of a car travelling inbound from `d`; car model faces -Z at 0. */
export const HEADING: Record<Direction, number> = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };

/** Right-hand traffic: the inbound lane lies to the driver's right of the road axis. */
function lateral(d: Direction) {
  const o = OUTWARD[d];
  return { x: o.z * LANE_W / 2, z: -o.x * LANE_W / 2 };
}

/**
 * Distance of the car centre from the junction centre along the inbound travel direction.
 * Negative = still on the approach. path_progress 0 = at the stop line (head of queue),
 * 0.5 = mid-junction, 1 = far stop line; queued cars sit queue_position slots behind.
 */
export function axialOffset(v: Pick<VehicleState, 'status' | 'path_progress' | 'queue_position'>): number {
  const behind = v.status === 'QUEUED' ? v.queue_position * QUEUE_SPACING : 0;
  const start = -STOP - CAR_LEN / 2 - behind;
  return start + v.path_progress * (2 * STOP + CAR_LEN / 2);
}

export function vehicleWorldPosition(v: Pick<VehicleState, 'direction' | 'status' | 'path_progress' | 'queue_position'>) {
  const s = axialOffset(v);
  const o = OUTWARD[v.direction];
  const l = lateral(v.direction);
  return { x: -o.x * s + l.x, z: -o.z * s + l.z, heading: HEADING[v.direction] };
}

/** Rendered world extent and the scenery-only side streets (no simulation meaning). */
export const WORLD = 120;
export const SIDE_STREET = 58;
export const SIDE_HALF = 2.2;

/**
 * Far-side mast-arm signal for approach `d` (standard far-side placement): the pole stands on the far-right
 * corner across the junction and the head hangs over the approach's own lane line on the exit side, so every
 * queued car (including the first one at the stop line) looks straight at it.
 * `yaw` rotates the head's front face (local +Z) back along the approach, toward the queue.
 */
export function signalPlacement(d: Direction) {
  const o = OUTWARD[d];
  const right = { x: o.z, z: -o.x }; // unit vector toward the inbound lane's kerb side
  const along = -(STOP + 0.6);       // beyond the centre, on the exit side
  return {
    head: { x: o.x * along + right.x * LANE_W / 2, z: o.z * along + right.z * LANE_W / 2 },
    pole: { x: o.x * along + right.x * (ROAD_HALF + 0.9), z: o.z * along + right.z * (ROAD_HALF + 0.9) },
    yaw: Math.atan2(o.x, o.z),
  };
}
