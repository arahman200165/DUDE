import type * as Y from 'yjs';
import { applyTextTo } from '../text-apply.js';
import { COLLAB_SEED_ORIGIN, asString, type CollabPayload, type CollabSchema } from './schema.js';

/** Same root name as the Markdown Workspace collab client, so an ephemeral room can be kept as a markdown-doc. */
export const MARKDOWN_TEXT = 'markdown';
export const MARKDOWN_META = 'meta';

function markdownSchema(withTitle: boolean): CollabSchema {
  return {
    seed(doc: Y.Doc, payload: CollabPayload): void {
      doc.transact(() => {
        const text = doc.getText(MARKDOWN_TEXT);
        if (text.length === 0) text.insert(0, asString(payload['body']));
        if (withTitle && typeof payload['title'] === 'string') doc.getMap<string>(MARKDOWN_META).set('title', payload['title']);
      }, COLLAB_SEED_ORIGIN);
    },
    materialize(doc: Y.Doc, current: CollabPayload): Record<string, unknown> {
      const body = doc.getText(MARKDOWN_TEXT).toString();
      if (!withTitle) return { ...current, body };
      const title = doc.getMap<string>(MARKDOWN_META).get('title');
      return { ...current, title: typeof title === 'string' ? title : asString(current['title']), body };
    },
    restore(doc: Y.Doc, snapshot: CollabPayload): void {
      doc.transact(() => {
        applyTextTo(doc.getText(MARKDOWN_TEXT), asString(snapshot['body']));
        if (withTitle && typeof snapshot['title'] === 'string') {
          const meta = doc.getMap<string>(MARKDOWN_META);
          if (meta.get('title') !== snapshot['title']) meta.set('title', snapshot['title']);
        }
      });
    },
  };
}

/** A persisted Markdown document: `Y.Text('markdown')` plus `Y.Map('meta')` with the title. */
export const markdownDocSchema: CollabSchema = markdownSchema(true);
/** An ephemeral Markdown Workspace room: the text only. */
export const roomSchema: CollabSchema = markdownSchema(false);
