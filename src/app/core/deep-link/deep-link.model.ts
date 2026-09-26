export type DudeDeepLink =
  | { readonly action: 'open'; readonly target: 'tool' | 'workspace-template' | 'project' | 'pipeline'; readonly id: string }
  | { readonly action: 'run'; readonly target: 'pipeline' | 'quick-run'; readonly id: string };

/** Strictly parse an IPC string; URL shape and allowed targets are closed. */
export function parseDudeDeepLink(raw: string): DudeDeepLink | null {
  if (raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'dude:' || url.username || url.password || url.port || url.search || url.hash) return null;
  const parts = url.pathname.split('/');
  if (parts.length !== 3 || parts[0] !== '') return null;
  let id: string;
  try { id = decodeURIComponent(parts[2]); } catch { return null; }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;

  const target = parts[1];
  if (url.hostname === 'open' && (target === 'tool' || target === 'workspace-template' || target === 'project' || target === 'pipeline')) {
    return { action: 'open', target, id };
  }
  if (url.hostname === 'run' && (target === 'pipeline' || target === 'quick-run')) {
    return { action: 'run', target, id };
  }
  return null;
}
