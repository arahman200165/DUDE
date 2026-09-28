/**
 * User-authored Home note + links (DUDE_PRD.md §21 Phase 30H.6). This is intentionally persisted,
 * *user-authored local content* — distinct from usage metrics, which never carry anything the user
 * typed. Plain text only (no HTML/markdown rendering), tightly bounded, and links are restricted to
 * http/https so a stored or imported value can never become a `javascript:`/`data:` navigation.
 */
export const HOME_PANEL_SCHEMA_VERSION = 1;
export const MAX_NOTE_CHARS = 2000;
export const MAX_LINKS = 10;
export const MAX_LABEL_CHARS = 60;
export const MAX_URL_CHARS = 500;

const LINK_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export interface HomePanelLink {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

/** The exportable part: what the user wrote. */
export interface HomePanelContent {
  readonly note: string;
  readonly links: readonly HomePanelLink[];
}

export interface HomePanelStore extends HomePanelContent {
  readonly schemaVersion: 1;
}

export const EMPTY_HOME_PANEL_CONTENT: HomePanelContent = { note: '', links: [] };
export const EMPTY_HOME_PANEL_STORE: HomePanelStore = { schemaVersion: 1, ...EMPTY_HOME_PANEL_CONTENT };

/** Same values as the backup bundle's conflict modes (kept local so `core/home-panel` never imports `core/backup`). */
export type HomePanelMergeMode = 'skip' | 'replace' | 'keep-both';

export type LinkValidation = { readonly ok: true; readonly link: Omit<HomePanelLink, 'id'> } | { readonly ok: false; readonly error: string };

/** Only absolute http(s) URLs, no embedded credentials, bounded length. Returns the normalized href. */
export function normalizeExternalUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_CHARS) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url.href;
}

/** Validates user-entered link fields; a blank label falls back to the URL's host. */
export function validateLink(label: string, url: string): LinkValidation {
  const href = normalizeExternalUrl(url);
  if (!href) return { ok: false, error: 'Enter a full http:// or https:// address (no username or password).' };
  const cleanLabel = label.trim().slice(0, MAX_LABEL_CHARS) || new URL(href).host;
  return { ok: true, link: { label: cleanLabel, url: href } };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Defensive parse of untrusted content (storage or an imported bundle). Never throws. */
export function sanitizeHomePanel(raw: unknown, newId: () => string = () => crypto.randomUUID()): HomePanelContent {
  if (!isRecord(raw)) return EMPTY_HOME_PANEL_CONTENT;
  const note = typeof raw['note'] === 'string' ? raw['note'].slice(0, MAX_NOTE_CHARS) : '';

  const links: HomePanelLink[] = [];
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of Array.isArray(raw['links']) ? raw['links'] : []) {
    if (links.length >= MAX_LINKS) break;
    if (!isRecord(item) || typeof item['url'] !== 'string') continue;
    const checked = validateLink(typeof item['label'] === 'string' ? item['label'] : '', item['url']);
    if (!checked.ok || seenUrls.has(checked.link.url)) continue;
    const rawId = item['id'];
    const id = typeof rawId === 'string' && LINK_ID_PATTERN.test(rawId) && !seenIds.has(rawId) ? rawId : newId();
    seenUrls.add(checked.link.url);
    seenIds.add(id);
    links.push({ id, ...checked.link });
  }
  return { note, links };
}

export function migrateHomePanelStore(raw: unknown): HomePanelStore {
  if (!isRecord(raw) || raw['schemaVersion'] !== HOME_PANEL_SCHEMA_VERSION) return EMPTY_HOME_PANEL_STORE;
  return { schemaVersion: 1, ...sanitizeHomePanel(raw) };
}

export function hasHomePanelContent(content: HomePanelContent): boolean {
  return content.note.trim().length > 0 || content.links.length > 0;
}

/**
 * Resolves an imported panel against the existing one (DUDE_PRD.md §21 Phase 26 conflict modes).
 * An empty existing panel simply adopts the import. `keep-both` keeps the existing note (or adopts
 * the imported one if there is none) and unions links by URL up to the bound.
 */
export function mergeHomePanel(existing: HomePanelContent, incoming: HomePanelContent, mode: HomePanelMergeMode): HomePanelContent {
  if (!hasHomePanelContent(existing)) return incoming;
  switch (mode) {
    case 'replace':
      return incoming;
    case 'skip':
      return existing;
    case 'keep-both': {
      const known = new Set(existing.links.map((link) => link.url));
      const extra = incoming.links.filter((link) => !known.has(link.url));
      return {
        note: existing.note.trim().length > 0 ? existing.note : incoming.note,
        links: [...existing.links, ...extra].slice(0, MAX_LINKS),
      };
    }
  }
}
