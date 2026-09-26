import { describe, expect, it } from 'vitest';
import { validateAgainstXsd } from './xsd-validate';

describe('XSD validator properties', () => {
  it('reports empty XML and schema as structured errors', async () => {
    await expect(validateAgainstXsd(' ', '<schema/>')).resolves.toMatchObject({ ok: false });
    await expect(validateAgainstXsd('<root/>', ' ')).resolves.toMatchObject({ ok: false });
  });
});
