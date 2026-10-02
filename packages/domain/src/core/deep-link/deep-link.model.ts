export type DudeDeepLink =
  | { readonly action: 'open'; readonly target: 'tool' | 'workspace-template' | 'project' | 'pipeline'; readonly id: string }
  | { readonly action: 'run'; readonly target: 'pipeline' | 'quick-run'; readonly id: string }
  /** `dude://open/settings` or `dude://open/settings/<section>` — the Settings shell destination. */
  | { readonly action: 'open'; readonly target: 'settings'; readonly section?: string };

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

/** Strictly parse an IPC string; URL shape and allowed targets are closed. */
export function parseDudeDeepLink(raw: string): DudeDeepLink | null {
  if (raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'dude:' || url.username || url.password || url.port || url.search || url.hash) return null;
  const parts = url.pathname.split('/');
  if (url.hostname === 'open' && parts.length === 2 && parts[0] === '' && parts[1] === 'settings') {
    return { action: 'open', target: 'settings' };
  }
  if (parts.length !== 3 || parts[0] !== '') return null;
  let id: string;
  try { id = decodeURIComponent(parts[2]); } catch { return null; }
  if (!ID_PATTERN.test(id)) return null;

  const target = parts[1];
  if (url.hostname === 'open' && target === 'settings') return { action: 'open', target, section: id };
  if (url.hostname === 'open' && (target === 'tool' || target === 'workspace-template' || target === 'project' || target === 'pipeline')) {
    return { action: 'open', target, id };
  }
  if (url.hostname === 'run' && (target === 'pipeline' || target === 'quick-run')) {
    return { action: 'run', target, id };
  }
  return null;
}

/**
 * The inverse of `parseDudeDeepLink` (Phase 26 Item 8, "Open in Desktop DUDE"). It only emits links
 * the strict parser accepts, returning `null` for an id it would reject, so a web page can never
 * build a link the desktop app then refuses.
 */
export function formatDudeDeepLink(link: DudeDeepLink): string | null {
  if (link.action === 'open' && link.target === 'settings') {
    if (link.section === undefined) return 'dude://open/settings';
    return ID_PATTERN.test(link.section) ? `dude://open/settings/${link.section}` : null;
  }
  return ID_PATTERN.test(link.id) ? `dude://${link.action}/${link.target}/${link.id}` : null;
}
