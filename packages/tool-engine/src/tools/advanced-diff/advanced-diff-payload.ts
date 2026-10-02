import { IgnoreOptions } from "./diff-normalize.js";

export type DiffGranularity = 'line' | 'char' | 'word';

/** Orthogonal to `granularity`, which only applies when mode is `'text'`. `'image'` is handled by a
 * fully separate payload/worker (`AdvancedDiffImagePayload`/`advanced-diff-image.worker.ts`) since
 * it's a different data type (images, not text) -- this union member exists just for the mode toggle. */
export type DiffMode = 'text' | 'semantic-json' | 'semantic-yaml' | 'semantic-xml' | 'image';

export interface AdvancedDiffPayload {
  readonly left: string;
  readonly right: string;
  readonly mode: DiffMode;
  readonly granularity: DiffGranularity;
  readonly ignoreOptions: IgnoreOptions;
  /** Present only in three-way merge mode — the common-ancestor text. */
  readonly base?: string;
}
