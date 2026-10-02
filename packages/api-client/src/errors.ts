/** Thrown for non-2xx responses carrying a hub ErrorEnvelope. */
export class HubApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'HubApiError';
  }
}
/** Thrown when a response (success or error) does not match its schema. */
export class HubProtocolError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'HubProtocolError';
  }
}
