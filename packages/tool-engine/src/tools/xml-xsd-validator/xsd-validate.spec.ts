import { validateAgainstXsd } from "./xsd-validate.js";

const XSD = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root" type="xs:string"/>
</xs:schema>`;

describe('validateAgainstXsd', () => {
  it('reports valid for XML that matches the schema', async () => {
    const result = await validateAgainstXsd('<root>hello</root>', XSD);

    expect(result).toEqual({ ok: true, valid: true, issues: [] });
  });

  it('reports invalid with issue detail for XML that violates the schema', async () => {
    const result = await validateAgainstXsd('<wrong>hello</wrong>', XSD);

    expect(result.ok).toBe(true);
    expect(result.ok && result.valid).toBe(false);
    expect(result.ok && result.issues.length).toBeGreaterThan(0);
    expect(result.ok && result.issues[0].line).toBe(1);
  });

  it('reports invalid (not a fatal error) for malformed XML', async () => {
    const result = await validateAgainstXsd('<root>hello', XSD);

    expect(result.ok).toBe(true);
    expect(result.ok && result.valid).toBe(false);
  });

  it('rejects empty XML or schema input', async () => {
    expect((await validateAgainstXsd('', XSD)).ok).toBe(false);
    expect((await validateAgainstXsd('<root>hello</root>', '   ')).ok).toBe(false);
  });

  it('reports a fatal error when the schema itself fails to compile', async () => {
    const result = await validateAgainstXsd('<root>hello</root>', 'not valid xsd [[[');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});
