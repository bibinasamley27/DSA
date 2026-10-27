import type { MockScript } from '../fixtures';
import { parseCommandRequestId } from './mockUtil';
import type { SimStore, Transport } from './store';

/**
 * Plays a recorded fixture through the same SimStore.ingest path as the live socket.
 * It executes no traffic logic: commands that survive client validation get a protocol-shaped ack,
 * but the fixture stream is unaffected. The UI labels mock mode prominently.
 */
export class MockTransport implements Transport {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private connected = false;
  private closed = false;
  private seq = 100_000;

  constructor(private store: SimStore, private script: MockScript) {}

  connect() {
    this.closed = false;
    this.store.setConnection('connecting');
    this.timer = setTimeout(() => { this.connected = true; this.store.setConnection('open'); this.next(); }, 0);
  }

  private next() {
    if (this.closed) return;
    const step = this.script.steps[this.index];
    if (!step) return;
    this.timer = setTimeout(() => {
      this.index += 1;
      if ('raw' in step) this.store.ingest(step.raw);
      else if (step.event === 'disconnect') { this.connected = false; this.store.setConnection('reconnecting'); }
      else { this.connected = true; this.store.setConnection('open'); }
      this.next();
    }, step.delayMs);
  }

  send(text: string): boolean {
    if (!this.connected) return false;
    const requestId = parseCommandRequestId(text);
    const snap = this.store.getState().snapshot;
    // Deliver asynchronously like a real socket.
    setTimeout(() => {
      if (!this.connected || !snap) return;
      this.store.ingest(JSON.stringify({
        protocol_version: '1.0', kind: 'ack', run_id: snap.run_id, sequence_number: this.seq++, tick: snap.tick,
        payload: { request_id: requestId, mock: true },
      }));
    }, 50);
    return true;
  }

  close() {
    this.closed = true;
    this.connected = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.store.setConnection('closed');
  }
}
