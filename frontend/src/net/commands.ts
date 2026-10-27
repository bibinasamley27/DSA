// Command construction + pre-send validation. Mirrors backend/fixtures/commands.schema.json
// and the lifecycle rules in backend/README.md; the server stays the final authority.
import type { Command, Direction, StateSnapshot } from '../types/simulation';

export const SCENARIOS = ['zero_demand', 'balanced', 'east_surge', 'fairness_trap', 'oscillation'] as const;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export const CONTROLLERS = ['fixed', 'adaptive'] as const;

export type CommandInput =
  | { command: 'start' | 'pause' | 'step' | 'reset' }
  | { command: 'set_seed'; seed: number }
  | { command: 'set_scenario'; scenario: (typeof SCENARIOS)[number] }
  | { command: 'set_speed'; speed: (typeof SPEEDS)[number] }
  | { command: 'set_controller'; controller_mode: (typeof CONTROLLERS)[number] }
  | { command: 'spawn_emergency'; direction: Direction };

/** Returns a human-readable reason the command must not be sent, or null if it is valid. */
export function validateCommand(input: CommandInput, snapshot: StateSnapshot | null): string | null {
  switch (input.command) {
    case 'start': case 'pause': break;
    case 'set_seed':
      if (!Number.isSafeInteger(input.seed)) return 'Seed must be an integer';
      break;
    case 'set_scenario':
      if (!SCENARIOS.includes(input.scenario)) return 'Unknown scenario';
      break;
    case 'set_speed':
      if (!SPEEDS.includes(input.speed)) return 'Speed must be 0.5, 1, 2 or 4';
      break;
    case 'set_controller':
      if (!CONTROLLERS.includes(input.controller_mode)) return 'Controller must be fixed or adaptive';
      break;
    case 'step': case 'reset': case 'spawn_emergency': break;
  }
  if (!snapshot) return 'Waiting for the first server snapshot';
  if (input.command === 'spawn_emergency') {
    // A live event: allowed running or paused. One waiting ambulance per approach (the engine enforces this too).
    const waiting = snapshot.vehicles.some((v) => v.kind === 'ambulance' && v.status === 'QUEUED' && v.direction === input.direction);
    return waiting ? 'An ambulance is already waiting on that approach' : null;
  }
  if (input.command === 'step') return snapshot.sim_status === 'paused' ? null : 'Step requires a paused simulation';
  if (input.command !== 'start' && input.command !== 'pause' && snapshot.sim_status === 'running') return 'Pause the simulation first';
  return null;
}

export function buildCommand(input: CommandInput, requestId: string): Command {
  return { protocol_version: '1.0', kind: 'command', request_id: requestId, ...input };
}
