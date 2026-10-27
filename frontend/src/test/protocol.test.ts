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
  describe('SRS snapshot invariants', () => {
    it('rejects a fifth, duplicate direction entry', () => {
      const f = frame(20);
      expect(parseServerMessage(raw({ ...f, direction_states: [...f.direction_states, f.direction_states[0]] })).ok).toBe(false);
      expect(parseServerMessage(raw({ ...f, queue_order: [...f.queue_order, 'N'] })).ok).toBe(false);
    });
    it('rejects queue_count that disagrees with the QUEUED vehicles', () => {
      const f = frame(20);
      const ds = f.direction_states.map((d, i) => (i === 0 ? { ...d, queue_count: d.queue_count + 1 } : d));
      const r = parseServerMessage(raw({ ...f, direction_states: ds }));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/queue_count/);
    });
    it('rejects future arrivals and EXITED vehicles in the active list', () => {
      const f = frame(20);
      const v = f.vehicles[0]!;
      expect(parseServerMessage(raw({ ...f, vehicles: [{ ...v, arrival_tick: f.tick + 1 }, ...f.vehicles.slice(1)] })).ok).toBe(false);
      expect(parseServerMessage(raw({ ...f, vehicles: [{ ...v, status: 'EXITED' }, ...f.vehicles.slice(1)] })).ok).toBe(false);
    });
  });
  it('rejects duplicate vehicle ids', () => {
    const f = frame(20);
    const v = f.vehicles[0]!;
    expect(parseServerMessage(raw({ ...f, vehicles: [v, v] })).ok).toBe(false);
  });
});
