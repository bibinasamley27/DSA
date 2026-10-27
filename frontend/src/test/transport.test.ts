import { getMockScript } from '../fixtures';
import { MockTransport } from '../net/mockTransport';
import { SimStore } from '../net/store';
import { MAX_RECONNECT_ATTEMPTS, WebSocketTransport } from '../net/transports';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null; onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null; onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) { FakeWS.instances.push(this); }
  send(t: string) { this.sent.push(t); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  drop() { this.readyState = 3; this.onclose?.(); }
}

beforeEach(() => { FakeWS.instances = []; vi.stubGlobal('WebSocket', FakeWS); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('WebSocketTransport', () => {
  it('keeps a single socket, reconnects with backoff, then gives up', () => {
    const store = new SimStore();
    const t = new WebSocketTransport(store, 'ws://x');
    t.connect(); t.connect();
    expect(FakeWS.instances).toHaveLength(1);
    FakeWS.instances[0]!.open();
    expect(store.getState().connection).toBe('open');
    FakeWS.instances[0]!.drop();
    expect(store.getState().connection).toBe('reconnecting');
    vi.advanceTimersByTime(499); expect(FakeWS.instances).toHaveLength(1);
    vi.advanceTimersByTime(2); expect(FakeWS.instances).toHaveLength(2);
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS + 2; i++) { FakeWS.instances.at(-1)!.drop(); vi.advanceTimersByTime(10_000); }
    expect(store.getState().connection).toBe('failed');
    const n = FakeWS.instances.length;
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.instances).toHaveLength(n);
  });
  it('close() stops reconnecting and detaches handlers', () => {
    const store = new SimStore();
    const t = new WebSocketTransport(store, 'ws://x');
    t.connect(); FakeWS.instances[0]!.open();
    t.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.instances).toHaveLength(1);
    expect(store.getState().connection).toBe('closed');
  });
  it('send reports false when not open', () => {
    const t = new WebSocketTransport(new SimStore(), 'ws://x');
    t.connect();
    expect(t.send('{}')).toBe(false);
  });
});

describe('MockTransport edge-case script', () => {
  it('survives stale, malformed, disconnect and new-run fixtures through the real store', () => {
    const store = new SimStore();
    store.attach(new MockTransport(store, getMockScript('edge_cases')));
    vi.runAllTimers();
    const s = store.getState();
    expect(s.rejected.staleSequence).toBeGreaterThanOrEqual(1);
    expect(s.rejected.malformed).toBe(2);
    expect(s.rejected.staleRun).toBeGreaterThanOrEqual(1);
    expect(s.snapshot?.run_id).toBe('fixture-new-run');
    expect(s.runEpoch).toBe(2);
    expect(s.connection).toBe('open');
  });
});
