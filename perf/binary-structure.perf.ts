import budget from './perf-budget.json';
import { buildBinary } from './perf-fixtures';
import { parseStruct, StructFieldDef } from '../src/app/tools/binary-structure-inspector/binary-structure-inspector-logic';

const FIELD_COUNT = 16_384;

describe('binary structure parsing performance', () => {
  it(`parses ${FIELD_COUNT} uint32 fields from a 64KB binary in under ${budget.binaryParse16kFields}ms`, () => {
    const bytes = buildBinary(FIELD_COUNT * 4);
    const fields: StructFieldDef[] = Array.from({ length: FIELD_COUNT }, (_, index) => ({
      name: `word-${index}`,
      type: 'uint32',
      length: 0,
      endianness: 'LE',
    }));

    const start = performance.now();
    const result = parseStruct(bytes, fields);
    const durationMs = performance.now() - start;

    console.log(`parseStruct(64KB, ${FIELD_COUNT} fields): ${durationMs.toFixed(1)}ms (budget ${budget.binaryParse16kFields}ms)`);
    expect(result.error).toBeNull();
    expect(result.fields).toHaveLength(FIELD_COUNT);
    expect(result.bytesConsumed).toBe(bytes.length);
    expect(durationMs).toBeLessThan(budget.binaryParse16kFields);
  });
});

