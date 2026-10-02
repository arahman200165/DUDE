import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { PAGE_SIZE, UnicodeTableRequest, runUnicodeTableRequest } from "@dude/tool-engine/tools/unicode-table/unicode-table-browse";

// A handful of small blocks, so browsing/searching stays cheap across many fast-check runs (the
// full curated block list spans ~260k code points, which is far too slow to scan 200x per test).
const SMALL_BLOCKS = ['Basic Latin', 'Latin-1 Supplement', 'Greek and Coptic', 'Armenian', 'Hebrew'] as const;
const blockNameArb = fc.constantFrom(...SMALL_BLOCKS);
// Page is a pagination index, always driven by the UI as a non-negative counter bounded by
// pageCount (see unicode-table.ts's previousPage/nextPage) -- never negative in practice.
const pageArb = fc.integer({ min: 0, max: 5 });
// Word-like queries only (letters, 2+ chars, no whitespace to trim down to 1): excludes anything
// that could hit the single-character or U+/0x/decimal exact-code-point-lookup branch, which
// intentionally ignores the block scope and would otherwise make the "stays in block" invariant
// below flaky.
const nameQueryArb = fc.stringMatching(/^[a-zA-Z]{2,10}$/);

describe('runUnicodeTableRequest — browse fuzzing', () => {
  const browseArb: fc.Arbitrary<UnicodeTableRequest> = fc.record({
    mode: fc.constant('browse' as const),
    blockName: blockNameArb,
    page: pageArb,
  });

  it('never throws for a valid block name and a non-negative page', () => {
    neverThrows((request: UnicodeTableRequest) => runUnicodeTableRequest(request), browseArb);
  });

  it('never returns more than a page of rows, all tagged with the requested block', () => {
    invariant(
      (request: UnicodeTableRequest) => runUnicodeTableRequest(request),
      browseArb,
      (result, request) => result.rows.length <= PAGE_SIZE && result.rows.every((row) => row.block === (request as { blockName: string }).blockName),
    );
  });
});

describe('runUnicodeTableRequest — search fuzzing', () => {
  const searchArb: fc.Arbitrary<UnicodeTableRequest> = fc.record({
    mode: fc.constant('search' as const),
    query: nameQueryArb,
    scope: fc.constant('block' as const),
    blockName: blockNameArb,
  });

  it('never throws for a name search scoped to a valid block', () => {
    neverThrows((request: UnicodeTableRequest) => runUnicodeTableRequest(request), searchArb);
  });

  it('never returns a row outside the requested block when scope is "block"', () => {
    invariant(
      (request: UnicodeTableRequest) => runUnicodeTableRequest(request),
      searchArb,
      (result, request) => result.rows.every((row) => row.block === (request as { blockName: string }).blockName),
    );
  });
});
