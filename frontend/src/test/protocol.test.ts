import { parseServerMessage } from '../net/protocol';
import { frame, raw, ack } from './helpers';

describe('parseServerMessage', () => {
  it('accepts recorded engine snapshots', () => {
    const r = parseServerMessage(raw(frame(20)));
    expect(r.ok && r.message.kind).toBe('state');
  });
  it.each([
    ['invalid JSON', '{nope'],
    ['wrong version', raw({ ...frame(), protocol_version: '2.0' })],
    ['unknown phase', raw({ ...frame(), phase: 'BLUE' })],
    ['progress out of range', raw({ ...frame(20), vehicles: [{ ...frame(20).vehicles[0], path_progress: 1.5 }] })],
    ['missing direction', raw({ ...frame(), direction_states: frame().direction_states.slice(1) })],
    ['active direction with ALL_RED', raw({ ...frame(), phase: 'ALL_RED' })],
    ['non-integer sequence', raw({ ...frame(), sequence_number: 1.5 })],
    ['unknown kind', raw({ ...frame(), kind: 'nope' })],
    ['ack without request_id', raw({ protocol_version: '1.0', kind: 'ack', run_id: 'r', sequence_number: 1, tick: 0, payload: {} })],
  ])('rejects %s', (_n, text) => {
    expect(parseServerMessage(text).ok).toBe(false);
  });
  it('accepts replies', () => {
    expect(parseServerMessage(ack('x', 3)).ok).toBe(true);
  });
  it('rejects duplicate vehicle ids', () => {
    const f = frame(20);
    const v = f.vehicles[0]!;
    expect(parseServerMessage(raw({ ...f, vehicles: [v, v] })).ok).toBe(false);
  });
});
