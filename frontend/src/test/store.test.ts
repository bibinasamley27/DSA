import { SimStore, type Transport } from '../net/store';
import { frame, raw, ack, errorMsg } from './helpers';

const RUN = 'fixture-east_surge';
function setup(sim_status: 'paused' | 'running' = 'paused') {
  const sent: string[] = [];
  const transport: Transport = { connect: () => undefined, send: (t) => { sent.push(t); return true; }, close: vi.fn() };
  const store = new SimStore('live', () => 0);
  store.attach(transport);
  store.setConnection('open');
  store.ingest(raw(frame(5, { sequence_number: 10, sim_status })));
  return { store, sent, transport };
}
const seqOf = (s: SimStore) => s.getState().snapshot?.sequence_number;

describe('SimStore ordering', () => {
  it('accepts increasing sequences and ignores out-of-order ones', () => {
    const { store } = setup();
    store.ingest(raw(frame(6, { sequence_number: 12 })));
    store.ingest(raw(frame(7, { sequence_number: 11 })));
    store.ingest(raw(frame(7, { sequence_number: 12 })));
    expect(seqOf(store)).toBe(12);
    expect(store.getState().rejected.staleSequence).toBe(2);
  });
  it('treats a higher-sequence new run_id as a new run and retires the old one', () => {
    const { store } = setup();
    const epoch = store.getState().runEpoch;
    store.ingest(raw(frame(1, { sequence_number: 20, run_id: 'run-b' })));
    expect(store.getState().snapshot?.run_id).toBe('run-b');
    expect(store.getState().runEpoch).toBe(epoch + 1);
    store.ingest(raw(frame(9, { sequence_number: 30, run_id: RUN }))); // late message of retired run
    expect(store.getState().snapshot?.run_id).toBe('run-b');
    expect(store.getState().rejected.staleRun).toBe(1);
  });
  it('counts malformed input without touching state', () => {
    const { store } = setup();
    const before = store.getState().snapshot;
    store.ingest('{"kind":"state"');
    expect(store.getState().snapshot).toBe(before);
    expect(store.getState().rejected.malformed).toBe(1);
    expect(store.getState().error).toMatch(/Malformed/);
  });
  it('keeps the last snapshot flagged stale on disconnect, and accepts a restarted sequence on reconnect', () => {
    const { store } = setup();
    store.setConnection('reconnecting');
    expect(store.getState().stale).toBe(true);
    expect(store.getState().snapshot).not.toBeNull();
    store.setConnection('open');
    store.ingest(raw(frame(8, { sequence_number: 2 })));
    expect(store.getState().stale).toBe(false);
    expect(seqOf(store)).toBe(2);
  });
  it('dedupes decisions by run/event id', () => {
    const { store } = setup();
    const ev = { event_id: 1, tick: 1, type: 'ARRIVAL', direction: 'N', description: 'x', data: {} };
    const trace = (s: number) => raw({ protocol_version: '1.0', kind: 'decision_trace', run_id: RUN, sequence_number: s, tick: 1, payload: { decisions: [ev] } });
    store.ingest(trace(11)); store.ingest(trace(12));
    expect(store.getState().decisions.filter((d) => d.event_id === 1)).toHaveLength(1);
  });
  it('ignores traces for other runs', () => {
    const { store } = setup();
    store.ingest(raw({ protocol_version: '1.0', kind: 'decision_trace', run_id: 'other', sequence_number: 99, tick: 1, payload: { decisions: [] } }));
    expect(store.getState().rejected.staleRun).toBe(1);
  });
});

describe('SimStore commands', () => {
  it('sends a valid command and tracks ack, then applied on the next state', () => {
    const { store, sent } = setup();
    const rec = store.sendCommand({ command: 'start' });
    expect(JSON.parse(sent[0]!)).toMatchObject({ command: 'start', kind: 'command', request_id: rec.requestId });
    expect(store.getState().commands[0]?.status).toBe('sent');
    store.ingest(ack(rec.requestId, 11));
    expect(store.getState().commands[0]?.status).toBe('accepted');
    store.ingest(raw(frame(6, { sequence_number: 12 })));
    expect(store.getState().commands[0]?.status).toBe('applied');
  });
  it('records server rejection', () => {
    const { store } = setup();
    const rec = store.sendCommand({ command: 'start' });
    store.ingest(errorMsg(rec.requestId, 11));
    expect(store.getState().commands[0]).toMatchObject({ status: 'rejected', message: expect.stringContaining('Invalid') });
  });
  it('does not send commands that fail validation or when disconnected', () => {
    const { store, sent } = setup('running');
    expect(store.sendCommand({ command: 'reset' }).status).toBe('not_sent');
    expect(store.sendCommand({ command: 'step' }).status).toBe('not_sent');
    store.setConnection('reconnecting');
    expect(store.sendCommand({ command: 'start' }).status).toBe('not_sent');
    expect(sent).toHaveLength(0);
  });
  it('ignores acks for foreign request ids', () => {
    const { store } = setup();
    store.ingest(ack('someone-else', 11));
    expect(store.getState().commands).toHaveLength(0);
  });
  it('times out unanswered commands and fails pending ones on disconnect', () => {
    vi.useFakeTimers();
    const { store } = setup();
    store.sendCommand({ command: 'start' });
    vi.advanceTimersByTime(5100);
    expect(store.getState().commands[0]?.status).toBe('timeout');
    store.sendCommand({ command: 'pause' });
    store.setConnection('reconnecting');
    expect(store.getState().commands[0]?.status).toBe('timeout');
    vi.useRealTimers();
  });
});

describe('SimStore subscriptions', () => {
  it('notifies subscribers, supports unsubscribe, and cleans up on dispose', () => {
    const { store, transport } = setup();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.ingest(raw(frame(6, { sequence_number: 11 })));
    expect(fn).toHaveBeenCalled();
    off(); fn.mockClear();
    store.ingest(raw(frame(7, { sequence_number: 12 })));
    expect(fn).not.toHaveBeenCalled();
    store.dispose();
    expect(transport.close).toHaveBeenCalled();
  });
  it('returns a stable state object between changes (useSyncExternalStore contract)', () => {
    const { store } = setup();
    expect(store.getState()).toBe(store.getState());
  });
});
