import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { diffSchemas } from "@dude/tool-engine/tools/schema-diff/schema-diff-logic";

describe('schema diff properties', () => {
  it('handles arbitrary table and column identifiers without throwing', () => {
    const identifier = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,12}$/);
    neverThrows(([table, column]: [string, string]) => {
      const sql = `CREATE TABLE ${table} (${column} VARCHAR(20))`;
      return diffSchemas(sql, sql, 'sqlite');
    }, fc.tuple(identifier, identifier), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});

