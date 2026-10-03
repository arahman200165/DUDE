import { DOCUMENT_ID } from '../codecs/documents.codec.js';

/**
 * kv keys whose value IS a synced singleton entity (Phase 31D). They live in the kv (the renderer persists them as
 * `local` signals), and the device store journals them as an entity op with the value as payload instead of as a
 * `setting`. The matching entity codecs stay `journaled: false` because no entity collection backs them.
 */
export interface KvEntityBinding {
  readonly namespace: string;
  readonly key: string;
  readonly entityType: 'workspace-layout' | 'scratchpad';
  readonly entityId: string;
}

export const KV_ENTITY_BINDINGS: readonly KvEntityBinding[] = [
  { namespace: '__workspace__', key: 'layout', entityType: 'workspace-layout', entityId: DOCUMENT_ID },
  { namespace: '__workspace__', key: 'scratchpad', entityType: 'scratchpad', entityId: DOCUMENT_ID },
];

export const findKvEntityBinding = (namespace: string, key: string): KvEntityBinding | undefined =>
  KV_ENTITY_BINDINGS.find((b) => b.namespace === namespace && b.key === key);

export const findKvBindingForEntity = (entityType: string, entityId: string): KvEntityBinding | undefined =>
  KV_ENTITY_BINDINGS.find((b) => b.entityType === entityType && b.entityId === entityId);
