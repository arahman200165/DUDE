/**
 * Collaborative document keys (PD-099/PD-106). Exactly four kinds exist: the three persisted surfaces and the
 * ephemeral Markdown Workspace room. A key is `kind:id` and is the Hub's per-document identity.
 */
export const COLLAB_DOC_KINDS = ['scratchpad', 'user-script', 'markdown-doc', 'room'] as const;
export type CollabDocKind = (typeof COLLAB_DOC_KINDS)[number];

export interface CollabDocRef {
  readonly kind: CollabDocKind;
  readonly id: string;
}

/** The only scratchpad document: the scratchpad is a singleton. */
export const SCRATCHPAD_DOC_ID = 'default';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isCollabDocKind(value: unknown): value is CollabDocKind {
  return typeof value === 'string' && (COLLAB_DOC_KINDS as readonly string[]).includes(value);
}

/** True when `id` is a legal id for `kind`. */
export function isCollabDocId(kind: CollabDocKind, id: unknown): id is string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return false;
  return kind !== 'scratchpad' || id === SCRATCHPAD_DOC_ID;
}

/** Formats `kind:id`; throws RangeError for an illegal kind or id (callers build keys from trusted values). */
export function formatCollabDocKey(kind: CollabDocKind, id: string): string {
  if (!isCollabDocKind(kind)) throw new RangeError(`Unknown collaborative document kind: ${String(kind)}`);
  if (!isCollabDocId(kind, id)) throw new RangeError(`Illegal ${kind} document id`);
  return `${kind}:${id}`;
}

/** Parses a `kind:id` key; null for anything that is not exactly a legal key. */
export function parseCollabDocKey(key: string): CollabDocRef | null {
  if (typeof key !== 'string') return null;
  const split = key.indexOf(':');
  if (split < 0) return null;
  const kind = key.slice(0, split);
  const id = key.slice(split + 1);
  if (!isCollabDocKind(kind) || !isCollabDocId(kind, id)) return null;
  return { kind, id };
}

/** The collaborative kind of a sync entity type; null for entity types that are not collaborative (rooms have no entity). */
export function collabKindForEntity(entityType: string): CollabDocKind | null {
  switch (entityType) {
    case 'scratchpad': return 'scratchpad';
    case 'user-script': return 'user-script';
    case 'markdown-doc': return 'markdown-doc';
    default: return null;
  }
}
