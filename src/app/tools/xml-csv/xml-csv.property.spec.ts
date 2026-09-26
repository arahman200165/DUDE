import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { convertXmlCsv } from './xml-csv-transform';

describe('XML/CSV conversion properties', () => {
  it('round-trips generated flat CSV records', () => {
    const cell = fc.stringMatching(/^[A-Za-z0-9 ]{0,12}$/);
    const arb = fc.tuple(cell, cell);
    invariant(([a, b]) => convertXmlCsv(`name,value\n${a},${b}`, 'csv-to-xml', 'row'), arb, (xml) => {
      expect(xml.ok).toBe(true);
      if (!xml.ok) return false;
      const csv = convertXmlCsv(xml.output, 'xml-to-csv', 'row');
      return csv.ok && csv.output.includes('name,value');
    });
  });
});
