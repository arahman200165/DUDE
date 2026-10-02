export interface HubRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
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
