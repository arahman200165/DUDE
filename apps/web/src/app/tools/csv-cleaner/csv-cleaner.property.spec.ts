import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { cleanCsv } from "@dude/tool-engine/tools/csv-cleaner/csv-clean";

describe('cleanCsv properties', () => {
  it('returns a result for arbitrary text and options', () => {
    neverThrows(([input, trimCells, dropEmptyRows]) => cleanCsv(input, { trimCells, dropEmptyRows }), fc.tuple(fc.string(), fc.boolean(), fc.boolean()));
  });
  it('cleaned output is idempotent with the same options', () => {
    invariant((input) => {
      const first = cleanCsv(input, { trimCells: true, dropEmptyRows: true });
      return first.ok ? cleanCsv(first.output, { trimCells: true, dropEmptyRows: true }).ok &&
        (cleanCsv(first.output, { trimCells: true, dropEmptyRows: true }) as { ok: true; output: string }).output === first.output : true;
    }, fc.array(fc.array(fc.string({ maxLength: 8 }), { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 6 }).map((rows) => rows.map((r) => r.join(',')).join('\n')), Boolean);
  });
});
