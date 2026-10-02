import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { csvToJson, jsonToCsv } from "@dude/tool-engine/tools/csv-viewer/csv-convert";

describe('CSV conversion properties', () => {
  it('parses valid generated CSV and serializes it as JSON', () => {
    invariant((input) => {
      const json = csvToJson(input, ',', true);
      return json.ok && Array.isArray(JSON.parse(json.output));
    }, fc.array(fc.tuple(fc.stringMatching(/^[a-z]{1,6}$/), fc.string({ maxLength: 12 })), { minLength: 1, maxLength: 12 })
      .map((rows) => ['key,value', ...rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(','))].join('\n')), Boolean);
  });
  it('handles arbitrary JSON conversion inputs without throwing', () => {
    neverThrows(([input, delimiter]) => jsonToCsv(input, delimiter), fc.tuple(fc.string(), fc.constantFrom(',' as const, ';' as const, '\t' as const)));
  });
});
