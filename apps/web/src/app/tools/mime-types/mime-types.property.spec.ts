import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { MIME_RESULTS_LIMIT, MimeFilterResult, filterMimeTypes } from "@dude/tool-engine/tools/mime-types/mime-search";
import { MIME_TYPES } from "@dude/tool-engine/tools/mime-types/mime-type-data";
import { COMMON_MIME_EXTENSIONS } from "@dude/tool-engine/tools/mime-types/mime-extension-overlay";

const topLevelArb = fc.constantFrom(
  'all' as const,
  'application' as const,
  'audio' as const,
  'font' as const,
  'image' as const,
  'message' as const,
  'model' as const,
  'multipart' as const,
  'text' as const,
  'video' as const,
);
const optionsArb = fc.record({ text: fc.string(), topLevelType: topLevelArb });

describe('filterMimeTypes fuzzing', () => {
  it('never throws for arbitrary text/top-level-type combinations against the real MIME table', () => {
    neverThrows((options) => filterMimeTypes(MIME_TYPES, COMMON_MIME_EXTENSIONS, options), optionsArb, {
      assertShape: (result) => {
        if (!Array.isArray((result as MimeFilterResult).rows)) throw new Error('expected rows to be an array');
      },
    });
  });

  it('never returns more rows than MIME_RESULTS_LIMIT, and truncated reflects totalMatches vs the limit', () => {
    invariant(
      (options) => filterMimeTypes(MIME_TYPES, COMMON_MIME_EXTENSIONS, options),
      optionsArb,
      (result) => result.rows.length <= MIME_RESULTS_LIMIT && result.truncated === result.totalMatches > MIME_RESULTS_LIMIT,
    );
  });
});
