import {
  DIRECTIONS,
  type StateSnapshot,
  type DecisionEvent,
} from "../types/simulation";
export function isSnapshot(value: unknown): value is StateSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as StateSnapshot;
  return (
    s.protocol_version === "1.0" &&
    s.kind === "state" &&
    typeof s.run_id === "string" &&
    Number.isInteger(s.sequence_number) &&
    Number.isInteger(s.tick) &&
    ["running", "paused", "stopped"].includes(s.sim_status) &&
    ["GREEN", "YELLOW", "ALL_RED"].includes(s.phase) &&
    typeof s.scenario === "string" &&
    Number.isInteger(s.seed) &&
    ["fixed", "adaptive"].includes(s.controller_mode) &&
    [0.5, 1, 2, 4].includes(s.speed) &&
    Number.isFinite(s.phase_remaining) &&
    (s.phase === "ALL_RED"
      ? s.active_direction === null
      : DIRECTIONS.includes(s.active_direction!)) &&
    Array.isArray(s.queue_order) &&
    s.queue_order.length === 4 &&
    new Set(s.queue_order).size === 4 &&
    s.queue_order.every((d) => DIRECTIONS.includes(d)) &&
    Array.isArray(s.direction_states) &&
    s.direction_states.length === 4 &&
    new Set(s.direction_states.map((d) => d.direction)).size === 4 &&
    s.direction_states.every(
      (d) =>
        DIRECTIONS.includes(d.direction) &&
        Number.isInteger(d.queue_count) &&
        d.queue_count >= 0 &&
        Number.isFinite(d.priority_score) &&
        Number.isFinite(d.max_wait_ticks) &&
        d.max_wait_ticks >= 0,
    ) &&
    Array.isArray(s.vehicles) &&
    s.vehicles.every(
      (v) =>
        Number.isInteger(v.id) &&
        DIRECTIONS.includes(v.direction) &&
        ["QUEUED", "CROSSING", "EXITED"].includes(v.status) &&
        v.arrival_tick <= s.tick &&
        v.path_progress >= 0 &&
        v.path_progress <= 1,
    ) &&
    s.direction_states.every(
      (d) =>
        d.queue_count ===
        s.vehicles.filter(
          (v) => v.direction === d.direction && v.status === "QUEUED",
        ).length,
    ) &&
    !!s.metrics &&
    [
      "arrived",
      "departed",
      "mean_wait_ticks",
      "max_wait_ticks",
      "switches",
      "fairness_overrides",
    ].every((k) => Number.isFinite(s.metrics[k as keyof typeof s.metrics])) &&
    Array.isArray(s.decisions) &&
    s.decisions.every(isDecision)
  );
}
export function isDecision(e: unknown): e is DecisionEvent {
  if (!e || typeof e !== "object") return false;
  const d = e as DecisionEvent;
  return (
    Number.isInteger(d.event_id) &&
    Number.isInteger(d.tick) &&
    typeof d.description === "string" &&
    [
      "ARRIVAL",
      "PHASE_CHANGE",
      "THRESHOLD",
      "SORT_COMPARE",
      "SORT_SWAP",
      "HYSTERESIS_REJECT",
      "FAIRNESS_OVERRIDE",
      "ORDER_COMMITTED",
      "SPILLBACK_BLOCK",
    ].includes(d.type) &&
    !!d.data &&
    typeof d.data === "object"
  );
}
export class SnapshotGate {
  current: StateSnapshot | null = null;
  retired = new Set<string>();
  accept(s: StateSnapshot) {
    if (this.retired.has(s.run_id)) return false;
    if (
      this.current?.run_id === s.run_id &&
      s.sequence_number <= this.current.sequence_number
    )
      return false;
    if (this.current && this.current.run_id !== s.run_id)
      this.retired.add(this.current.run_id);
    this.current = s;
    return true;
  }
  reconnect() {
    this.current = null;
    this.retired.clear();
  }
}
export function mergeEvents(
  previous: DecisionEvent[],
  incoming: DecisionEvent[],
) {
  const map = new Map(previous.map((e) => [e.event_id, e]));
  incoming.forEach((e) => map.set(e.event_id, e));
  return [...map.values()].sort((a, b) => a.event_id - b.event_id).slice(-500);
}
