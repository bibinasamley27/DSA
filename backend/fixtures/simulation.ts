// v1.0 backend handoff: mirror of models.py; no frontend files modified.
export type Direction = 'N' | 'E' | 'S' | 'W';
export interface Envelope {
  protocol_version: '1.0'; kind: string; run_id: string;
  sequence_number: number; tick: number;
}
export interface DirectionState {
  direction: Direction; queue_count: number; max_wait_ticks: number;
  priority_score: number; congestion_flag: boolean; downstream_free_slots: number | null;
}
export interface VehicleState {
  id: number; direction: Direction; status: 'QUEUED' | 'CROSSING' | 'EXITED';
  arrival_tick: number; path_progress: number; queue_position: number;
  kind: 'car' | 'ambulance';
}
export interface DecisionEvent {
  event_id: number; tick: number;
  type: 'ARRIVAL' | 'PHASE_CHANGE' | 'THRESHOLD' | 'SORT_COMPARE' | 'SORT_SWAP' |
    'HYSTERESIS_REJECT' | 'FAIRNESS_OVERRIDE' | 'ORDER_COMMITTED' | 'SPILLBACK_BLOCK' |
    'EMERGENCY_DETECTED' | 'PREEMPT_START' | 'PREEMPT_END';
  direction: Direction | null; description: string; data: Record<string, unknown>;
}
export interface MetricsState {
  arrived: number; departed: number; mean_wait_ticks: number;
  max_wait_ticks: number; switches: number; fairness_overrides: number;
  emergencies: number; mean_emergency_wait_ticks: number;
}
/** Waiting ambulance with green priority (earliest arrival first); null when none. */
export interface Preemption { direction: Direction; vehicle_id: number; since_tick: number }
export interface StateSnapshot extends Envelope {
  kind: 'state'; sim_status: 'paused' | 'running' | 'stopped'; scenario: string;
  seed: number; controller_mode: 'fixed' | 'adaptive'; speed: 0.5 | 1 | 2 | 4;
  phase: 'GREEN' | 'YELLOW' | 'ALL_RED'; phase_remaining: number;
  active_direction: Direction | null; direction_states: DirectionState[];
  queue_order: Direction[]; vehicles: VehicleState[]; metrics: MetricsState;
  decisions: DecisionEvent[]; preemption: Preemption | null;
}
export interface Reply extends Envelope {
  kind: 'welcome' | 'ack' | 'error' | 'decision_trace'; payload: Record<string, unknown>;
}
interface CommandBase { protocol_version: '1.0'; kind: 'command'; request_id: string; }
export type Command = CommandBase & (
  {command: 'start' | 'pause' | 'step' | 'reset'} |
  {command: 'set_seed'; seed: number} |
  {command: 'set_scenario'; scenario: 'zero_demand' | 'balanced' | 'east_surge' | 'fairness_trap' | 'oscillation'} |
  {command: 'set_speed'; speed: 0.5 | 1 | 2 | 4} |
  {command: 'set_controller'; controller_mode: 'fixed' | 'adaptive'} |
  {command: 'spawn_emergency'; direction: Direction}
);
