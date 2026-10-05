import { parseDudeDeepLink } from '@dude/domain/core/deep-link/deep-link.model';

/** Navigation only. Query strings, fragments, run requests and input payloads are refused. */
export function mobileDeepLinkPath(raw: string): string | null {
  let candidate = raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'dude:' && url.hostname === 'tools' && !url.username && !url.password && !url.port && !url.search && !url.hash && /^\/[^/]+$/.test(url.pathname)) {
      candidate = `dude://open/tool${url.pathname}`;
    }
  } catch { return null; }
  const link = parseDudeDeepLink(candidate);
  if (link?.action !== 'open') return null;
  if (link.target === 'tool') return `/tools/${encodeURIComponent(link.id)}`;
  if (link.target === 'settings') {
    if (!link.section) return '/(tabs)/settings';
    if (link.section === 'appearance' || link.section === 'connection' || link.section === 'sync' || link.section === 'recovery') return `/settings/${link.section}`;
  }
  return null;
}
