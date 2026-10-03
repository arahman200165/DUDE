import type { Migration } from './index.js';

/**
 * Reverse-proxy leaf pins (Phase 31E). `hub_enrollment.proxy_spkis` is a JSON array of the proxy SPKI pins the Hub advertised
 * (active plus staged next); they are accepted in addition to the Hub's own pins. Additive, so minReaderVersion stays 1.
 */
export const migration0004: Migration = {
  version: 4,
  name: 'hub-proxy-pins',
  minReaderVersion: 1,
  sql: `
ALTER TABLE hub_enrollment ADD COLUMN proxy_spkis TEXT NOT NULL DEFAULT '[]';
`,
};
