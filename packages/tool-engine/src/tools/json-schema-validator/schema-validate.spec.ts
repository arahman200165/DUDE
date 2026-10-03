import { detectDraft, validateJsonSchema } from "./schema-validate.js";

const draft07Schema = JSON.stringify({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
});

const draft2020Schema = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
});

const noDialectSchema = JSON.stringify({
  type: 'object',
  properties: { age: { type: 'number' } },
  required: ['age'],
});

describe('detectDraft', () => {
  it('detects 2020-12 from $schema', () => {
    expect(detectDraft(JSON.parse(draft2020Schema))).toBe('2020-12');
  });

  it('detects draft-07 from $schema', () => {
    expect(detectDraft(JSON.parse(draft07Schema))).toBe('draft-07');
  });

  it('defaults to draft-07 when $schema is absent', () => {
    expect(detectDraft(JSON.parse(noDialectSchema))).toBe('draft-07');
  });
});

describe('validateJsonSchema', () => {
  it('reports ok for a valid instance under draft-07', () => {
    const result = validateJsonSchema(draft07Schema, JSON.stringify({ name: 'Ada' }), 'auto');
    expect(result).toEqual({ ok: true, draft: 'draft-07' });
  });

  it('reports ok for a valid instance under 2020-12', () => {
    const result = validateJsonSchema(draft2020Schema, JSON.stringify({ name: 'Ada' }), 'auto');
    expect(result).toEqual({ ok: true, draft: '2020-12' });
  });

  it('respects an explicit draft override even when $schema says otherwise', () => {
    const result = validateJsonSchema(draft2020Schema, JSON.stringify({ name: 'Ada' }), 'draft-07');
    expect(result.ok).toBe(true);
    expect(result.ok && result.draft).toBe('draft-07');
  });

  it('reports a required-property validation error with its instance path', () => {
    const result = validateJsonSchema(draft07Schema, JSON.stringify({}), 'auto');
    expect(result.ok).toBe(false);
    if (!result.ok && result.stage === 'validation') {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].keyword).toBe('required');
      expect(result.errors[0].instancePath).toBe('/');
    } else {
      throw new Error('expected a validation-stage failure');
    }
  });

  it('reports a type-mismatch error with a non-root instance path', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    const result = validateJsonSchema(schema, JSON.stringify({ name: 42 }), 'auto');
    expect(result.ok).toBe(false);
    if (!result.ok && result.stage === 'validation') {
      expect(result.errors[0].keyword).toBe('type');
      expect(result.errors[0].instancePath).toBe('/name');
    } else {
      throw new Error('expected a validation-stage failure');
    }
  });

  it('reports an enum violation', () => {
    const schema = JSON.stringify({ type: 'string', enum: ['a', 'b'] });
    const result = validateJsonSchema(schema, JSON.stringify('c'), 'auto');
    expect(result.ok).toBe(false);
    if (!result.ok && result.stage === 'validation') {
      expect(result.errors[0].keyword).toBe('enum');
    } else {
      throw new Error('expected a validation-stage failure');
    }
  });

  it('validates format keywords via the format keyword', () => {
    const schema = JSON.stringify({ type: 'string', format: 'email' });
    const result = validateJsonSchema(schema, JSON.stringify('not-an-email'), 'auto');
    expect(result.ok).toBe(false);
    if (!result.ok && result.stage === 'validation') {
      expect(result.errors[0].keyword).toBe('format');
    } else {
      throw new Error('expected a validation-stage failure');
    }
  });

  it('reports an additionalProperties violation', () => {
    const schema = JSON.stringify({ type: 'object', properties: {}, additionalProperties: false });
    const result = validateJsonSchema(schema, JSON.stringify({ extra: 1 }), 'auto');
    expect(result.ok).toBe(false);
    if (!result.ok && result.stage === 'validation') {
      expect(result.errors[0].keyword).toBe('additionalProperties');
    } else {
      throw new Error('expected a validation-stage failure');
    }
  });

  it('reports schema-json stage for malformed schema JSON', () => {
    const result = validateJsonSchema('{not json', '{}', 'auto');
    expect(result).toMatchObject({ ok: false, stage: 'schema-json' });
  });

  it('reports instance-json stage for malformed instance JSON', () => {
    const result = validateJsonSchema('{}', '{not json', 'auto');
    expect(result).toMatchObject({ ok: false, stage: 'instance-json' });
  });

  it('reports schema-compile stage for a schema that fails to compile', () => {
    const badSchema = JSON.stringify({ type: 'string', pattern: '(' });
    const result = validateJsonSchema(badSchema, JSON.stringify('x'), 'auto');
    expect(result).toMatchObject({ ok: false, stage: 'schema-compile' });
  });
});
