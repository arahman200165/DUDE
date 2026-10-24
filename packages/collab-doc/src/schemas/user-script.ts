import type * as Y from 'yjs';
import { applyTextTo } from '../text-apply.js';
import { COLLAB_SEED_ORIGIN, asString, type CollabPayload, type CollabSchema } from './schema.js';

export const USER_SCRIPT_BODY = 'body';

/** The user-script `body` as one Y.Text; every other script field is single-writer and stays in the record. */
export const userScriptSchema: CollabSchema = {
  seed(doc: Y.Doc, payload: CollabPayload): void {
    doc.transact(() => {
      const body = doc.getText(USER_SCRIPT_BODY);
      if (body.length === 0) body.insert(0, asString(payload['body']));
    }, COLLAB_SEED_ORIGIN);
  },
  materialize(doc: Y.Doc, current: CollabPayload): Record<string, unknown> {
    return { ...current, body: doc.getText(USER_SCRIPT_BODY).toString() };
  },
  restore(doc: Y.Doc, snapshot: CollabPayload): void {
    applyTextTo(doc.getText(USER_SCRIPT_BODY), asString(snapshot['body']));
  },
};
