import type { Migration } from './index.js';

/**
 * Hub authority epoch (Phase 31G, PD-071/PD-073). `hub_enrollment.authority_epoch` is the highest epoch the Hub has reported to this
 * device; it only ever rises. An enrollment that never saw one reads as epoch 1. Additive, so minReaderVersion stays 1.
 */
export const migration0005: Migration = {
  version: 5,
  name: 'hub-authority-epoch',
  minReaderVersion: 1,
  sql: `
ALTER TABLE hub_enrollment ADD COLUMN authority_epoch INTEGER NOT NULL DEFAULT 1;
`,
};
