import {
  HOME_LAYOUT_SCHEMA_VERSION, isNewerHomeLayoutSchema, sanitizeHomeLayoutData,
} from '@dude/domain/core/home-layout/home-layout-store.model';
import type { HomeLayoutStore, KindCatalog } from '@dude/domain/core/home-layout/home-layout-store.model';
import type { HomeLayout } from '@dude/domain/core/home-layout/home-layout.model';
import type { EntityCodec } from './entity-codec.js';
import { DOCUMENT_ID } from './documents.codec.js';
import { isRecord } from './codec-helpers.js';

/** What decoding needs from the host: the panel-kind catalog and the manifest-generated default layout. */
export interface HomeLayoutCodecContext {
  readonly catalog: KindCatalog;
  readonly defaults: HomeLayout;
}

/** True for a record written by a newer DUDE build; callers must not persist anything derived from it. */
export function isNewerHomeLayoutDocument(raw: unknown): boolean {
  return isNewerHomeLayoutSchema(raw);
}

/**
 * Best-effort read of a current-or-newer document (newer ones read with the v1 sanitizer). For read-only
 * use of newer data; `homeLayoutCodec.decode` returns null for those so they are never rewritten.
 */
export function decodeHomeLayoutReadOnly(raw: unknown, ctx: HomeLayoutCodecContext): HomeLayoutStore | null {
  if (!isRecord(raw)) return null;
  if (raw['schemaVersion'] !== HOME_LAYOUT_SCHEMA_VERSION && !isNewerHomeLayoutSchema(raw)) return null;
  return { schemaVersion: 1, ...sanitizeHomeLayoutData(raw, ctx.catalog, ctx.defaults) };
}

export const homeLayoutCodec: EntityCodec<HomeLayoutStore, HomeLayoutCodecContext> = {
  entityType: 'home-layout',
  schemaVersion: HOME_LAYOUT_SCHEMA_VERSION,
  scope: 'environment',
  sensitivity: 'non-sensitive',
  journaled: true,
  idOf: () => DOCUMENT_ID,
  decode(raw, ctx) {
    if (isNewerHomeLayoutSchema(raw)) return null;
    return decodeHomeLayoutReadOnly(raw, ctx);
  },
  encode: (store) => ({ ...store }),
};
