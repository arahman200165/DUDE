import type { HubRequest, HubResponse, HubTransport } from '@dude/api-client';
import { isTransferredResponse, noteHubTransferred } from './hub-transferred-signal';

export const HUB_CSRF_HEADER = 'X-DUDE-CSRF';

export interface FetchHubTransportOptions {
  readonly fetch?: typeof fetch;
  /** The CSRF token of the current cookie session, held in memory only. Sent on every mutating request. */
  readonly csrfToken: () => string | undefined;
}

export interface FetchHubTransport extends HubTransport {
  /** `Retry-After` of the most recent response in milliseconds, or null when it carried none. */
  lastRetryAfterMs(): number | null;
}

/** Same-origin browser transport: relative URLs, the session cookie (`same-origin` credentials), JSON in and out. */
export function createFetchHubTransport(options: FetchHubTransportOptions): FetchHubTransport {
  let retryAfterMs: number | null = null;
  return {
    lastRetryAfterMs: () => retryAfterMs,
    async request(req: HubRequest): Promise<HubResponse> {
      const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
      if (req.body !== undefined) headers['content-type'] = 'application/json';
      const csrf = options.csrfToken();
      if (req.method !== 'GET' && csrf !== undefined) headers[HUB_CSRF_HEADER] = csrf;
      const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
      const res = await doFetch(req.path, {
        method: req.method,
        credentials: 'same-origin',
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
      });
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, name) => {
        responseHeaders[name.toLowerCase()] = value;
      });
      const retryAfter = responseHeaders['retry-after'];
      retryAfterMs = retryAfter !== undefined && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : null;
      const text = await res.text();
      let body: unknown;
      if (text !== '') {
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
      }
      // A transferred Hub answers 503 `hub-transferred` to everything but `hello`; tell the page once, wherever it was seen.
      if (isTransferredResponse(res.status, body)) noteHubTransferred();
      return { status: res.status, headers: responseHeaders, body };
    },
  };
}
