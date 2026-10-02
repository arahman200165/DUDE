import type { EntityCodec } from './entity-codec.js';
import { favoriteCodec } from './favorite.codec.js';
import { pipelineCodec, userScriptCodec } from './pipeline.codec.js';
import { projectCodec, workspaceTemplateCodec } from './project.codec.js';
import {
  appearanceCodec, usageCodec, workspaceLayoutCodec, scratchpadCodec, nativeRecentsCodec, historyEntryCodec,
} from './documents.codec.js';
import { homeLayoutCodec } from './home-layout.codec.js';

export type { EntityCodec } from './entity-codec.js';
export { favoriteCodec, favoriteItemId, favoritesToItems, itemsToFavorites } from './favorite.codec.js';
export type { FavoriteItem, FavoriteKind } from './favorite.codec.js';
export { pipelineCodec, userScriptCodec } from './pipeline.codec.js';
export { projectCodec, workspaceTemplateCodec } from './project.codec.js';
export {
  DOCUMENT_ID, appearanceCodec, usageCodec, workspaceLayoutCodec, scratchpadCodec, nativeRecentsCodec, historyEntryCodec,
} from './documents.codec.js';
export { homeLayoutCodec, isNewerHomeLayoutDocument, decodeHomeLayoutReadOnly } from './home-layout.codec.js';
export type { HomeLayoutCodecContext } from './home-layout.codec.js';
export { sanitizePanelTree } from './codec-helpers.js';

export const ENTITY_CODECS: Readonly<Record<string, EntityCodec<any, any>>> = {
  [favoriteCodec.entityType]: favoriteCodec,
  [pipelineCodec.entityType]: pipelineCodec,
  [userScriptCodec.entityType]: userScriptCodec,
  [projectCodec.entityType]: projectCodec,
  [workspaceTemplateCodec.entityType]: workspaceTemplateCodec,
  [appearanceCodec.entityType]: appearanceCodec,
  [homeLayoutCodec.entityType]: homeLayoutCodec,
  [usageCodec.entityType]: usageCodec,
  [workspaceLayoutCodec.entityType]: workspaceLayoutCodec,
  [scratchpadCodec.entityType]: scratchpadCodec,
  [nativeRecentsCodec.entityType]: nativeRecentsCodec,
  [historyEntryCodec.entityType]: historyEntryCodec,
};

export const JOURNALED_ENTITY_TYPES: readonly string[] = Object.values(ENTITY_CODECS)
  .filter((codec) => codec.journaled)
  .map((codec) => codec.entityType);

export const isKnownEntityType = (entityType: string): boolean => Object.hasOwn(ENTITY_CODECS, entityType);
