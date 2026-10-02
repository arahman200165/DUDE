import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { CREATE_TABLE_DIALECTS, generateCreateTable } from "@dude/tool-engine/tools/create-table-generator/create-table-generator-logic";

describe('generateCreateTable properties', () => {
  const sample = fc.array(fc.tuple(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,8}$/), fc.integer()), { minLength: 1, maxLength: 8 })
    .map((pairs) => JSON.stringify([Object.fromEntries(pairs)]));
  it('generates repeatable DDL for every supported dialect', () => {
    invariant((input) => CREATE_TABLE_DIALECTS.every(({ id }) => {
      const first = generateCreateTable(input, 'sample_table', id);
      const second = generateCreateTable(input, 'sample_table', id);
      return first.ok && second.ok && first.sql === second.sql && first.sql.startsWith('CREATE TABLE ');
    }), sample, Boolean);
  });
  it('handles arbitrary sample text without throwing', () => {
    neverThrows((input) => generateCreateTable(input, 'table', 'postgresql'), fc.string());
  });
});
