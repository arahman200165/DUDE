import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { asyncNeverThrows } from '../../../testing/property-harness';
import { validateAgainstXsd } from './xsd-validate';

const XSD = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root" type="xs:string"/>
</xs:schema>`;

function expectResultShape(result: unknown): void {
  expect(result).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
  const shaped = result as { ok: boolean; valid?: boolean; issues?: unknown[]; error?: { message: string } };
  if (shaped.ok) {
    expect(typeof shaped.valid).toBe('boolean');
    expect(Array.isArray(shaped.issues)).toBe(true);
    for (const issue of shaped.issues ?? []) {
      expect(issue).toEqual(expect.objectContaining({ message: expect.any(String) }));
      const line = (issue as { line?: unknown }).line;
      expect(line === null || (typeof line === 'number' && Number.isInteger(line) && line > 0)).toBe(true);
    }
  } else {
    expect(typeof shaped.error?.message).toBe('string');
    expect(shaped.error?.message.length).toBeGreaterThan(0);
  }
}

describe('XSD validator properties', () => {
  it('reports empty XML and schema as structured errors', async () => {
    await expect(validateAgainstXsd(' ', '<schema/>')).resolves.toMatchObject({ ok: false });
    await expect(validateAgainstXsd('<root/>', ' ')).resolves.toMatchObject({ ok: false });
  });

  it('resolves with a typed result shape for arbitrary XML and schema text', async () => {
    const xml = fc.oneof(
      fc.string(),
      fc.stringMatching(/^[a-zA-Z0-9 ]{0,24}$/).map((text) => `<root>${text}</root>`),
    );
    const schema = fc.oneof(fc.string(), fc.constant(XSD), fc.constant('not valid xsd [[['));

    await asyncNeverThrows(
      ([xmlInput, xsdInput]: readonly [string, string]) => validateAgainstXsd(xmlInput, xsdInput),
      fc.tuple(xml, schema),
      { numRuns: 30, assertShape: expectResultShape },
    );
  });
});
