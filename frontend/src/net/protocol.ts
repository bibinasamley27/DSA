// Network-boundary validation for protocol v1.0 server messages. Everything past this file
// works with the frozen types from ../types/simulation.ts and never sees unvalidated JSON.
import type {
  DecisionEvent, Direction, DirectionState, MetricsState, Reply, StateSnapshot, VehicleState,
} from '../types/simulation';

export type ServerMessage = StateSnapshot | Reply;
export type ParseResult = { ok: true; message: ServerMessage } | { ok: false; error: string };

export const DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W'];
const SPEEDS = [0.5, 1, 2, 4] as const;
const REPLY_KINDS = ['welcome', 'ack', 'error', 'decision_trace'] as const;
const DECISION_TYPES = ['ARRIVAL', 'PHASE_CHANGE', 'THRESHOLD', 'SORT_COMPARE', 'SORT_SWAP',
  'HYSTERESIS_REJECT', 'FAIRNESS_OVERRIDE', 'ORDER_COMMITTED', 'SPILLBACK_BLOCK'] as const;

class Invalid extends Error {}
type Obj = Record<string, unknown>;

const fail = (path: string, why: string): never => { throw new Invalid(`${path}: ${why}`); };
const obj = (v: unknown, path: string): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, 'expected object');
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'expected array'));
const num = (v: unknown, path: string, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(path, `expected number in [${min}, ${max}]`);
const int = (v: unknown, path: string, min = -Infinity): number =>
  Number.isInteger(num(v, path, min)) ? (v as number) : fail(path, 'expected integer');
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, 'expected string'));
const bool = (v: unknown, path: string): boolean => (typeof v === 'boolean' ? v : fail(path, 'expected boolean'));
function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], path: string): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fail(path, `expected one of ${allowed.join(', ')}`);
}
const dir = (v: unknown, path: string): Direction => oneOf(v, DIRECTIONS, path);

function vehicle(v: unknown, path: string): VehicleState {
  const o = obj(v, path);
  return {
    id: int(o.id, `${path}.id`),
    direction: dir(o.direction, `${path}.direction`),
    status: oneOf(o.status, ['QUEUED', 'CROSSING', 'EXITED'] as const, `${path}.status`),
    arrival_tick: int(o.arrival_tick, `${path}.arrival_tick`, 0),
    path_progress: num(o.path_progress, `${path}.path_progress`, 0, 1),
    queue_position: int(o.queue_position, `${path}.queue_position`, 0),
  };
}

function directionState(v: unknown, path: string): DirectionState {
  const o = obj(v, path);
  const free = o.downstream_free_slots;
  return {
    direction: dir(o.direction, `${path}.direction`),
    queue_count: int(o.queue_count, `${path}.queue_count`, 0),
    max_wait_ticks: int(o.max_wait_ticks, `${path}.max_wait_ticks`, 0),
    priority_score: num(o.priority_score, `${path}.priority_score`),
    congestion_flag: bool(o.congestion_flag, `${path}.congestion_flag`),
    downstream_free_slots: free === null ? null : int(free, `${path}.downstream_free_slots`, 0),
  };
}

function metrics(v: unknown, path: string): MetricsState {
  const o = obj(v, path);
  return {
    arrived: int(o.arrived, `${path}.arrived`, 0),
    departed: int(o.departed, `${path}.departed`, 0),
    mean_wait_ticks: num(o.mean_wait_ticks, `${path}.mean_wait_ticks`, 0),
    max_wait_ticks: int(o.max_wait_ticks, `${path}.max_wait_ticks`, 0),
    switches: int(o.switches, `${path}.switches`, 0),
    fairness_overrides: int(o.fairness_overrides, `${path}.fairness_overrides`, 0),
  };
}

function decision(v: unknown, path: string): DecisionEvent {
  const o = obj(v, path);
  return {
    event_id: int(o.event_id, `${path}.event_id`),
    tick: int(o.tick, `${path}.tick`, 0),
    type: oneOf(o.type, DECISION_TYPES, `${path}.type`),
    direction: o.direction === null ? null : dir(o.direction, `${path}.direction`),
    description: str(o.description, `${path}.description`),
    data: obj(o.data, `${path}.data`),
  };
}

const uniqueDirections = (list: Direction[], path: string) => {
  if (new Set(list).size !== 4) fail(path, 'must contain all four directions exactly once');
};

function state(o: Obj): StateSnapshot {
  const direction_states = arr(o.direction_states, 'direction_states').map((d, i) => directionState(d, `direction_states[${i}]`));
  const queue_order = arr(o.queue_order, 'queue_order').map((d, i) => dir(d, `queue_order[${i}]`));
  uniqueDirections(direction_states.map((d) => d.direction), 'direction_states');
  uniqueDirections(queue_order, 'queue_order');
  const phase = oneOf(o.phase, ['GREEN', 'YELLOW', 'ALL_RED'] as const, 'phase');
  const active_direction = o.active_direction === null ? null : dir(o.active_direction, 'active_direction');
  if ((phase === 'ALL_RED') !== (active_direction === null)) fail('active_direction', 'must be null exactly during ALL_RED');
  const vehicles = arr(o.vehicles, 'vehicles').map((v, i) => vehicle(v, `vehicles[${i}]`));
  if (new Set(vehicles.map((v) => v.id)).size !== vehicles.length) fail('vehicles', 'duplicate vehicle id');
  return {
    protocol_version: '1.0', kind: 'state', ...envelope(o),
    sim_status: oneOf(o.sim_status, ['paused', 'running', 'stopped'] as const, 'sim_status'),
    scenario: str(o.scenario, 'scenario'),
    seed: int(o.seed, 'seed'),
    controller_mode: oneOf(o.controller_mode, ['fixed', 'adaptive'] as const, 'controller_mode'),
    speed: oneOf(o.speed, SPEEDS, 'speed'),
    phase,
    phase_remaining: int(o.phase_remaining, 'phase_remaining', 1),
    active_direction,
    direction_states, queue_order, vehicles,
    metrics: metrics(o.metrics, 'metrics'),
    decisions: arr(o.decisions, 'decisions').map((d, i) => decision(d, `decisions[${i}]`)),
  };
}

const envelope = (o: Obj) => ({
  run_id: str(o.run_id, 'run_id'),
  sequence_number: int(o.sequence_number, 'sequence_number', 1),
  tick: int(o.tick, 'tick', 0),
});

function reply(o: Obj): Reply {
  const kind = oneOf(o.kind, REPLY_KINDS, 'kind');
  const payload = obj(o.payload, 'payload');
  if (kind === 'ack') str(payload.request_id, 'payload.request_id');
  if (kind === 'error' && payload.request_id != null) str(payload.request_id, 'payload.request_id');
  if (kind === 'decision_trace') arr(payload.decisions, 'payload.decisions').forEach((d, i) => decision(d, `payload.decisions[${i}]`));
  return { protocol_version: '1.0', kind, ...envelope(o), payload };
}

export function parseServerMessage(raw: string): ParseResult {
  try {
    const o = obj(JSON.parse(raw), 'message');
    if (o.protocol_version !== '1.0') fail('protocol_version', 'unsupported (expected "1.0")');
    return { ok: true, message: o.kind === 'state' ? state(o) : reply(o) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    if (e instanceof SyntaxError) return { ok: false, error: 'invalid JSON' };
    throw e;
  }
}

/** decision_trace payload.decisions, already validated by parseServerMessage. */
export const traceDecisions = (r: Reply): DecisionEvent[] => arr(r.payload.decisions, 'payload.decisions').map((d, i) => decision(d, `decisions[${i}]`));
