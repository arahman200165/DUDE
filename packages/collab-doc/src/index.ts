// Portable Yjs mapping for DUDE's collaborative documents (Phase 31J). Consumed only by apps/hub and apps/web;
// the Device Agent relays opaque bytes (PD-106) and Android never collaborates.
export * from './doc-key.js';
export { applyTextTo } from './text-apply.js';
export * from './frames.js';
export * from './awareness.js';
export * from './transport.js';
export * from './relay-transport.js';
export * from './schemas/index.js';
