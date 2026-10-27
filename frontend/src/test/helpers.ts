import type { StateSnapshot } from '../types/simulation';
import eastSurge from '../fixtures/east_surge.json';

/** Real recorded frame i (valid by construction) with overrides. */
export const frame = (i = 5, over: Partial<StateSnapshot> = {}): StateSnapshot =>
  ({ ...(eastSurge[i] as unknown as StateSnapshot), ...over });
export const raw = (o: unknown) => JSON.stringify(o);
export const ack = (request_id: string, sequence_number: number, run_id = 'fixture-east_surge') =>
  raw({ protocol_version: '1.0', kind: 'ack', run_id, sequence_number, tick: 0, payload: { request_id } });
export const errorMsg = (request_id: string | null, sequence_number: number, run_id = 'fixture-east_surge') =>
  raw({ protocol_version: '1.0', kind: 'error', run_id, sequence_number, tick: 0, payload: { request_id, message: 'Invalid command or lifecycle state' } });
