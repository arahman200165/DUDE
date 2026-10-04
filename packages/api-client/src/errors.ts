/** Thrown for non-2xx responses carrying a hub ErrorEnvelope. */
export class HubApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'HubApiError';
  }
}
/** The HTTP status and error code of a request to a Hub that was transferred to another machine (PD-071). */
export const HUB_TRANSFERRED_STATUS = 503;
export const HUB_TRANSFERRED_CODE = 'hub-transferred';

/** True for the distinct error a transferred (read-only) Hub answers to everything except `hello`. */
export function isHubTransferredError(error: unknown): error is HubApiError {
  return error instanceof HubApiError && error.status === HUB_TRANSFERRED_STATUS && error.code === HUB_TRANSFERRED_CODE;
}

/** Thrown when a response (success or error) does not match its schema. */
export class HubProtocolError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'HubProtocolError';
  }
}
