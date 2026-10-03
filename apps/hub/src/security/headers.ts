import type { FastifyInstance } from 'fastify';

// `connect-src blob:`: tools re-read their own object URLs with fetch() (Image Compressor's Download, others that save
// a generated Blob); without it the fetch is blocked and the download silently never happens. Found by the Hub e2e CSP sweep.
//
// PD-056: `connect-src https: wss:` lets the network-declared tools (JWKS fetch, package metadata, LanguageTool, link
// checker, collab relay) fetch from the browser as they do on Pages; their manifests already disclose network use.
// `img-src https:` is for remote images in Markdown/HTML previews. The page CSP never gets 'unsafe-eval': code that
// needs it runs an eval-free path or in the opaque-origin sandbox pages.
const HUB_WEB_CSP_TAIL =
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
  "font-src 'self' data:; connect-src 'self' blob: https: wss:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; " +
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
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
};

const SANDBOX_CSP_TAIL = "frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

/**
 * Outer CSP ceilings for the static sandbox loader pages (`apps/web/public/sandbox/*.html`). Each page's inline loader
 * script is allowed here; the document a tool writes into it adds its own, stricter, meta CSP. Sandboxed iframes with
 * `src` get their own CSP (a `srcdoc` would inherit the app CSP and have its inline scripts blocked).
 */
const SANDBOX_PAGE_CSP: Readonly<Record<string, (host: string | undefined) => string>> = {
  '/sandbox/code.html': () =>
    `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; ${SANDBOX_CSP_TAIL}`,
  // Pyodide's assets come from the Hub origin. `'self'` is the page URL's origin; the explicit origin (from the Host
  // header, which the Host guard has already validated) matches what python-sandbox-doc's meta CSP names.
  '/sandbox/python.html': (host) => {
    const origin = host !== undefined && /^[A-Za-z0-9.\-:[\]]+$/.test(host) ? ` https://${host}` : '';
    return `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' 'self'${origin}; worker-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'${origin}; ${SANDBOX_CSP_TAIL}`;
  },
  '/sandbox/html.html': () =>
    `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; ${SANDBOX_CSP_TAIL}`,
  '/sandbox/plugin.html': () => `default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; ${SANDBOX_CSP_TAIL}`,
};

/** The page CSP when `url` is exactly one of the four sandbox loader pages, else null. */
export function sandboxPageCsp(url: string, host: string | undefined): string | null {
  const pathname = url.split('?')[0]?.split('#')[0] ?? '/';
  return Object.hasOwn(SANDBOX_PAGE_CSP, pathname) ? (SANDBOX_PAGE_CSP[pathname]?.(host) ?? null) : null;
}

export function isApiPath(url: string): boolean {
  const pathname = url.split('?')[0] ?? '/';
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Public vendor runtime files that the opaque-origin Python sandbox (`/sandbox/python.html`) fetches and imports. From
 * that frame every request is cross-origin, so these files, and only these, are readable cross-origin (the desktop's
 * `dude-app:` protocol does the same). They are static, credential-free build artifacts.
 */
export function isCrossOriginReadableAsset(url: string): boolean {
  const pathname = url.split('?')[0] ?? '/';
  return pathname.startsWith('/assets/vendor/pyodide/') && !pathname.includes('..');
}

/** Sets the security headers on every response. CORS headers are set only on `isCrossOriginReadableAsset` files. */
export function registerSecurityHeaders(app: FastifyInstance, options: { hsts?: () => boolean } = {}): void {
  const baseHeaders = (): Array<[string, string]> => {
    const sendHsts = options.hsts?.() ?? true;
    return Object.entries(HUB_BASE_HEADERS).filter(([name]) => sendHsts || name !== 'Strict-Transport-Security');
  };
  app.addHook('onSend', async (request, reply, payload) => {
    const sandboxCsp = request.method === 'GET' || request.method === 'HEAD' ? sandboxPageCsp(request.url, request.headers.host) : null;
    if (sandboxCsp !== null && (reply.statusCode === 200 || reply.statusCode === 304)) {
      // Sandbox loader page: embeddable by this origin only, with its own CSP. Everything else stays as for the app.
      for (const [name, value] of baseHeaders()) if (name !== 'X-Frame-Options') void reply.header(name, value);
      void reply.header('Content-Security-Policy', sandboxCsp);
      void reply.header('Cache-Control', 'no-cache');
      return payload;
    }
    for (const [name, value] of baseHeaders()) void reply.header(name, value);
    if ((request.method === 'GET' || request.method === 'HEAD') && isCrossOriginReadableAsset(request.url)) {
      void reply.header('Access-Control-Allow-Origin', '*');
      void reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    if (isApiPath(request.url)) void reply.header('Content-Security-Policy', HUB_API_CSP);
    // The static handler may already have set a per-response CSP (inline-script hashes for index.html).
    else if (!reply.hasHeader('content-security-policy')) void reply.header('Content-Security-Policy', HUB_WEB_CSP);
    return payload;
  });
}
