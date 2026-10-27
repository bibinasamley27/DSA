import { buildCommand, validateCommand } from '../net/commands';
import { frame } from './helpers';

const paused = frame(5, { sim_status: 'paused' });
const running = frame(5, { sim_status: 'running' });

describe('validateCommand', () => {
  it('requires a snapshot for lifecycle-bound commands', () => {
    expect(validateCommand({ command: 'start' }, null)).toMatch(/snapshot/);
  });
  it('step only when paused', () => {
    expect(validateCommand({ command: 'step' }, paused)).toBeNull();
    expect(validateCommand({ command: 'step' }, running)).not.toBeNull();
    expect(validateCommand({ command: 'step' }, frame(5, { sim_status: 'stopped' }))).not.toBeNull();
  });
  it('setup and reset need a non-running sim; start/pause always allowed', () => {
    expect(validateCommand({ command: 'reset' }, running)).not.toBeNull();
    expect(validateCommand({ command: 'set_speed', speed: 2 }, running)).not.toBeNull();
    expect(validateCommand({ command: 'set_speed', speed: 2 }, paused)).toBeNull();
    expect(validateCommand({ command: 'pause' }, running)).toBeNull();
    expect(validateCommand({ command: 'start' }, running)).toBeNull();
  });
  it('rejects bad payloads', () => {
    expect(validateCommand({ command: 'set_seed', seed: 1.5 }, paused)).not.toBeNull();
    expect(validateCommand({ command: 'set_seed', seed: Number('abc') }, paused)).not.toBeNull();
    expect(validateCommand({ command: 'set_seed', seed: -3 }, paused)).toBeNull();
  });
});

describe('buildCommand', () => {
  it('produces flat v1.0 command envelopes', () => {
    expect(buildCommand({ command: 'set_scenario', scenario: 'east_surge' }, 'r1')).toEqual({
      protocol_version: '1.0', kind: 'command', request_id: 'r1', command: 'set_scenario', scenario: 'east_surge',
    });
  });
});
