export interface HubRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /**
   * A binary body sent as-is (never JSON-encoded), for the resumable upload chunks (32-SS1, Milestone 845). The request's `headers` carry its
   * `content-type` (`application/octet-stream`); a transport sends `Content-Length` and does not add a JSON content type. Mutually exclusive with `body`.
   */
  rawBody?: Uint8Array;
  /**
   * `bytes` (32-SS1, Milestone 849): the caller wants a binary answer (the standby object route). A transport that supports it returns a 2xx
   * `body` as a `Uint8Array` of exactly the received bytes and still parses a non-2xx JSON error envelope; one that does not must leave the body
   * as it is, and the client then refuses the answer with `HubProtocolError` rather than guessing. Absent means JSON.
   */
  responseType?: 'json' | 'bytes';
  headers?: Record<string, string>;
}
export interface HubResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
/** Port implemented by hosts (pinned-TLS node transport, browser fetch, test fakes). Portable code never touches the network directly. */
export interface HubTransport {
  request(req: HubRequest): Promise<HubResponse>;
}
