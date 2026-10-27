export function parseCommandRequestId(text: string): string {
  const o: unknown = JSON.parse(text);
  return typeof o === 'object' && o !== null && 'request_id' in o && typeof o.request_id === 'string' ? o.request_id : '';
}
