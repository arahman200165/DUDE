import * as Y from 'yjs';
import { applyTextTo } from '../text-apply.js';
import { COLLAB_SEED_ORIGIN, asString, type CollabPayload, type CollabSchema } from './schema.js';

export const SCRATCHPAD_SNIPPETS = 'snippets';
export const SCRATCHPAD_ORDER = 'order';

/** A snippet as it appears in the record payload. */
export interface CollabSnippet {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly sourceToolId?: string;
  readonly createdAt: string;
}

const snippetsOf = (doc: Y.Doc): Y.Map<Y.Map<unknown>> => doc.getMap<Y.Map<unknown>>(SCRATCHPAD_SNIPPETS);
const orderOf = (doc: Y.Doc): Y.Array<string> => doc.getArray<string>(SCRATCHPAD_ORDER);

/** Reads a record payload's `snippets` defensively; entries without a string id are skipped, first id wins. */
export function snippetsOfPayload(payload: CollabPayload): CollabSnippet[] {
  const raw = payload['snippets'];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CollabSnippet[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const id = e['id'];
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: asString(e['title']),
      body: asString(e['body']),
      ...(typeof e['sourceToolId'] === 'string' ? { sourceToolId: e['sourceToolId'] } : {}),
      createdAt: asString(e['createdAt']),
    });
  }
  return out;
}

function createSnippetMap(snippet: CollabSnippet): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('title', new Y.Text(snippet.title));
  map.set('body', new Y.Text(snippet.body));
  map.set('createdAt', snippet.createdAt);
  if (snippet.sourceToolId !== undefined) map.set('sourceToolId', snippet.sourceToolId);
  return map;
}

/** Adds a snippet as Y operations (at `index` in the order, default the end). False when the id already exists. */
export function addSnippet(doc: Y.Doc, snippet: CollabSnippet, index?: number): boolean {
  const snippets = snippetsOf(doc);
  if (snippets.has(snippet.id)) return false;
  doc.transact(() => {
    snippets.set(snippet.id, createSnippetMap(snippet));
    const order = orderOf(doc);
    order.insert(index === undefined ? order.length : Math.max(0, Math.min(index, order.length)), [snippet.id]);
  });
  return true;
}

/** Removes a snippet and its order entries. False when it does not exist. */
export function removeSnippet(doc: Y.Doc, id: string): boolean {
  const snippets = snippetsOf(doc);
  if (!snippets.has(id)) return false;
  doc.transact(() => {
    snippets.delete(id);
    const order = orderOf(doc);
    for (let i = order.length - 1; i >= 0; i -= 1) if (order.get(i) === id) order.delete(i, 1);
  });
  return true;
}

/** The snippet ids in display order: `order` first (duplicates and deleted ids skipped), then any others by createdAt. */
export function snippetOrder(doc: Y.Doc): string[] {
  const snippets = snippetsOf(doc);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of orderOf(doc).toArray()) {
    if (typeof id === 'string' && snippets.has(id) && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  const missing: Array<{ id: string; createdAt: string }> = [];
  snippets.forEach((entry, id) => {
    if (!seen.has(id)) missing.push({ id, createdAt: entry instanceof Y.Map ? asString(entry.get('createdAt')) : '' });
  });
  missing.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [...ids, ...missing.map(m => m.id)];
}

/** Makes `ids` the display order (ids that do not exist are ignored; unlisted snippets follow by createdAt). */
export function reorderSnippets(doc: Y.Doc, ids: readonly string[]): void {
  const snippets = snippetsOf(doc);
  const target = [...new Set(ids)].filter(id => snippets.has(id));
  const current = orderOf(doc).toArray();
  if (target.length === current.length && target.every((id, i) => id === current[i])) return;
  doc.transact(() => {
    const order = orderOf(doc);
    if (order.length > 0) order.delete(0, order.length);
    order.insert(0, target);
  });
}

/** Moves one snippet to `toIndex` of the display order. */
export function moveSnippet(doc: Y.Doc, id: string, toIndex: number): void {
  const ids = snippetOrder(doc);
  const from = ids.indexOf(id);
  if (from < 0) return;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id);
  reorderSnippets(doc, ids);
}

/** Reads one snippet; null when missing or malformed. */
export function readSnippet(doc: Y.Doc, id: string): CollabSnippet | null {
  const entry = snippetsOf(doc).get(id);
  if (!(entry instanceof Y.Map)) return null;
  const title = entry.get('title');
  const body = entry.get('body');
  const sourceToolId = entry.get('sourceToolId');
  return {
    id,
    title: title instanceof Y.Text ? title.toString() : '',
    body: body instanceof Y.Text ? body.toString() : '',
    ...(typeof sourceToolId === 'string' ? { sourceToolId } : {}),
    createdAt: asString(entry.get('createdAt')),
  };
}

/** Edits an existing snippet's title and/or body as text edits; false when the snippet does not exist. */
export function editSnippet(doc: Y.Doc, id: string, fields: { title?: string; body?: string }): boolean {
  const entry = snippetsOf(doc).get(id);
  if (!(entry instanceof Y.Map)) return false;
  doc.transact(() => {
    const title = entry.get('title');
    const body = entry.get('body');
    if (fields.title !== undefined && title instanceof Y.Text) applyTextTo(title, fields.title);
    if (fields.body !== undefined && body instanceof Y.Text) applyTextTo(body, fields.body);
  });
  return true;
}

export const scratchpadSchema: CollabSchema = {
  seed(doc: Y.Doc, payload: CollabPayload): void {
    if (snippetsOf(doc).size > 0) return;
    doc.transact(() => {
      for (const snippet of snippetsOfPayload(payload)) addSnippet(doc, snippet);
    }, COLLAB_SEED_ORIGIN);
  },
  materialize(doc: Y.Doc, current: CollabPayload): Record<string, unknown> {
    const snippets: CollabSnippet[] = [];
    for (const id of snippetOrder(doc)) {
      const snippet = readSnippet(doc, id);
      if (snippet) snippets.push(snippet);
    }
    return { ...current, snippets };
  },
  restore(doc: Y.Doc, snapshot: CollabPayload): void {
    const target = snippetsOfPayload(snapshot);
    const wanted = new Set(target.map(s => s.id));
    doc.transact(() => {
      for (const id of [...snippetsOf(doc).keys()]) if (!wanted.has(id)) removeSnippet(doc, id);
      for (const snippet of target) {
        const entry = snippetsOf(doc).get(snippet.id);
        if (!(entry instanceof Y.Map)) {
          addSnippet(doc, snippet);
          continue;
        }
        const title = entry.get('title');
        const body = entry.get('body');
        if (title instanceof Y.Text) applyTextTo(title, snippet.title); else entry.set('title', new Y.Text(snippet.title));
        if (body instanceof Y.Text) applyTextTo(body, snippet.body); else entry.set('body', new Y.Text(snippet.body));
        if (entry.get('createdAt') !== snippet.createdAt) entry.set('createdAt', snippet.createdAt);
        if (snippet.sourceToolId === undefined) { if (entry.has('sourceToolId')) entry.delete('sourceToolId'); }
        else if (entry.get('sourceToolId') !== snippet.sourceToolId) entry.set('sourceToolId', snippet.sourceToolId);
      }
      reorderSnippets(doc, target.map(s => s.id));
    });
  },
};
