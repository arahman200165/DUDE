import type { FastifyInstance } from 'fastify';

const HUB_WEB_CSP_TAIL =
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/**
 * Builds the web CSP. `scriptExtras` are extra script-src tokens (inline-script hashes, 'unsafe-hashes') that the
 * static handler adds for a single HTML response; script-src never gets 'unsafe-inline'.
 */
export function buildWebCsp(scriptExtras: readonly string[] = []): string {
  const script = ["'self'", "'wasm-unsafe-eval'", ...scriptExtras].join(' ');
  return `default-src 'self'; script-src ${script}; ${HUB_WEB_CSP_TAIL}`;
}

/**
 * CSP for the Hub-served web app (static/HTML responses). Kept in one place so a later milestone can test
 * it across every tool.
 */
export const HUB_WEB_CSP = buildWebCsp();

export const HUB_API_CSP = "default-src 'none'; frame-ancestors 'none'";

export const HUB_BASE_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

export function isApiPath(url: string): boolean {
  const pathname = url.split('?')[0] ?? '/';
  return pathname === '/api' || pathname.startsWith('/api/');
}

/** Sets the security headers on every response. CORS headers are deliberately never set anywhere. */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    for (const [name, value] of Object.entries(HUB_BASE_HEADERS)) void reply.header(name, value);
    if (isApiPath(request.url)) void reply.header('Content-Security-Policy', HUB_API_CSP);
    // The static handler may already have set a per-response CSP (inline-script hashes for index.html).
    else if (!reply.hasHeader('content-security-policy')) void reply.header('Content-Security-Policy', HUB_WEB_CSP);
    return payload;
  });
}
