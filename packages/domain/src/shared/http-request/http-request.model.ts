import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export type HttpBody =
  | { readonly kind: 'none' }
  | { readonly kind: 'raw'; readonly text: string; readonly contentType: string | null }
  | { readonly kind: 'multipart'; readonly fields: readonly KeyValuePair[] }; // a value starting with '@' denotes a file

export interface BasicAuth {
  readonly username: string;
  readonly password: string;
}

export interface ParsedHttpRequest {
  readonly method: string;
  readonly url: string; // base URL, without a query string
  readonly queryParams: readonly KeyValuePair[];
  readonly headers: readonly KeyValuePair[];
  readonly body: HttpBody;
  readonly auth: BasicAuth | null;
}

export const EMPTY_REQUEST: ParsedHttpRequest = {
  method: 'GET',
  url: '',
  queryParams: [],
  headers: [],
  body: { kind: 'none' },
  auth: null,
};

/** Reassembles `url` + `queryParams` into a single URL string. */
export function buildFullUrl(request: ParsedHttpRequest): string {
  if (request.queryParams.length === 0) return request.url;

  const params = new URLSearchParams();
  for (const pair of request.queryParams) {
    if (pair.key === '') continue;
    params.append(pair.key, pair.value);
  }

  const query = params.toString();
  if (query === '') return request.url;

  const separator = request.url.includes('?') ? '&' : '?';
  return `${request.url}${separator}${query}`;
}

/** Splits a full URL into its base (no query) and parsed query params. */
export function splitUrl(url: string): { readonly base: string; readonly queryParams: readonly KeyValuePair[] } {
  const questionIndex = url.indexOf('?');
  if (questionIndex === -1) return { base: url, queryParams: [] };

  const base = url.slice(0, questionIndex);
  const params = new URLSearchParams(url.slice(questionIndex + 1));
  const queryParams = Array.from(params.entries()).map(([key, value]) => ({ key, value }));

  return { base, queryParams };
}
