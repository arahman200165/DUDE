export interface HubRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /**
   * A binary body sent as-is (never JSON-encoded), for the resumable upload chunks (32-SS1, Milestone 845). The request's `headers` carry its
   * `content-type` (`application/octet-stream`); a transport sends `Content-Length` and does not add a JSON content type. Mutually exclusive with `body`.
   */
  rawBody?: Uint8Array;
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
