import { APP_HOST, APP_SCHEME } from './app-protocol';

/**
 * Keep document navigations on the renderer's own origin. `URL.origin` is the opaque string
 * 'null' for custom schemes, so the packaged `dude-app://app/` origin is compared by protocol and
 * host instead; the dev server (http/https) is compared by protocol, host and port.
 */
export function isAllowedRendererNavigation(target: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const next = new URL(target);
    if (base.protocol === `${APP_SCHEME}:`) {
      return next.protocol === `${APP_SCHEME}:` && next.host === APP_HOST;
    }
    if (base.protocol === 'http:' || base.protocol === 'https:') {
      return next.protocol === base.protocol && next.hostname === base.hostname && next.port === base.port;
    }
    return false;
  } catch {
    return false;
  }
}
