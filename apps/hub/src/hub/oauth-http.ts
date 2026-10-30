/**
 * The one outbound form POST of the backup destinations' OAuth modules (32-SS1, Milestones 856 and 857): a `fetch` with redirects never
 * followed, a timeout and a bounded body, answered as a value (`'unreachable'` or a status with the parsed JSON object, if any). It is
 * shared by `drive-oauth.ts` (Google) and `onedrive-oauth.ts` (Microsoft); neither the provider's text, the form nor a token ever leaves
 * it in a message. The endpoint a module posts to is a fixed constant (a test seam is a loopback fake no configuration can reach).
 */
export type OAuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

const TOKEN_MAX_BYTES = 64 * 1024;
const TOKEN_TIMEOUT_MS = 20_000;

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > TOKEN_MAX_BYTES) { try { await response.body?.cancel(); } catch { /* best effort */ } return ''; }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > TOKEN_MAX_BYTES) { try { await reader.cancel(); } catch { /* best effort */ } return ''; }
      chunks.push(value);
    }
  } catch {
    return '';
  }
  return Buffer.concat(chunks).toString('utf8');
}

export type OAuthPostResult = { status: number; json: Record<string, unknown> | undefined } | 'unreachable';

export async function postForm(fetchImpl: OAuthFetch, url: string, form: URLSearchParams): Promise<OAuthPostResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(), signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    return 'unreachable';
  }
  const text = await readBounded(response);
  let json: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  } catch { /* not JSON */ }
  return { status: response.status, json };
}
