import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { diffDependencyLists } from "@dude/tool-engine/tools/dependency-version-comparator/dependency-version-compare";

describe('diffDependencyLists properties', () => {
  it('never throws for arbitrary dependency text and emits name-sorted rows', () => {
    const inputs = fc.tuple(fc.string({ maxLength: 300 }), fc.string({ maxLength: 300 }));
    neverThrows(([before, after]: [string, string]) => diffDependencyLists(before, after), inputs);
    invariant(([before, after]) => diffDependencyLists(before, after), inputs, (rows) => rows.every((row, i) => i === 0 || rows[i - 1].name.localeCompare(row.name) <= 0));
  });
});
