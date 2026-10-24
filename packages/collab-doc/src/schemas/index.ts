import type * as Y from 'yjs';
import type { CollabDocKind } from '../doc-key.js';
import { markdownDocSchema, roomSchema } from './markdown.js';
import { scratchpadSchema } from './scratchpad.js';
import type { CollabPayload, CollabSchema } from './schema.js';
import { userScriptSchema } from './user-script.js';

export { COLLAB_SEED_ORIGIN } from './schema.js';
export type { CollabPayload, CollabSchema } from './schema.js';
export * from './scratchpad.js';
export { USER_SCRIPT_BODY, userScriptSchema } from './user-script.js';
export { MARKDOWN_TEXT, MARKDOWN_META, markdownDocSchema, roomSchema } from './markdown.js';

const SCHEMAS: Readonly<Record<CollabDocKind, CollabSchema>> = {
  scratchpad: scratchpadSchema,
  'user-script': userScriptSchema,
  'markdown-doc': markdownDocSchema,
  room: roomSchema,
};

export function collabSchemaFor(kind: CollabDocKind): CollabSchema {
  return SCHEMAS[kind];
}

/** Seeds a brand-new document from a record payload. Only the Hub calls this, once, on first load. */
export function seedCollabDoc(doc: Y.Doc, kind: CollabDocKind, payload: CollabPayload): void {
  SCHEMAS[kind].seed(doc, payload);
}

/** The plain record payload for the document's current state. */
export function materializeCollabDoc(doc: Y.Doc, kind: CollabDocKind, current: CollabPayload): Record<string, unknown> {
  return SCHEMAS[kind].materialize(doc, current);
}

/** Brings the document's content to a snapshot with ordinary Yjs edits; never rewinds or replaces the document. */
export function restoreAsForwardEdit(doc: Y.Doc, kind: CollabDocKind, snapshotPayload: CollabPayload): void {
  SCHEMAS[kind].restore(doc, snapshotPayload);
}

/** UTF-8 length of a string without a host TextEncoder (a lone surrogate counts as its 3-byte replacement). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i += 1; }
    else bytes += 3;
  }
  return bytes;
}

/** UTF-8 size of the JSON of the materialized collaborative content, for the record size cap. */
export function contentBytes(doc: Y.Doc, kind: CollabDocKind): number {
  return utf8Length(JSON.stringify(SCHEMAS[kind].materialize(doc, {})));
}
