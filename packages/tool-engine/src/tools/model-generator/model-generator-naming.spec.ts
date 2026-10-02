import { describe, expect, it } from 'vitest';
import { isValidIdentifier, toCamelCase, toPascalCase, toSnakeCase } from "./model-generator-naming.js";

describe('case conversion for generated field/type names', () => {
  it('converts snake_case', () => {
    expect(toPascalCase('first_name')).toBe('FirstName');
    expect(toCamelCase('first_name')).toBe('firstName');
    expect(toSnakeCase('first_name')).toBe('first_name');
  });

  it('converts camelCase', () => {
    expect(toPascalCase('firstName')).toBe('FirstName');
    expect(toCamelCase('firstName')).toBe('firstName');
    expect(toSnakeCase('firstName')).toBe('first_name');
  });

  it('converts kebab-case', () => {
    expect(toPascalCase('first-name')).toBe('FirstName');
    expect(toSnakeCase('first-name')).toBe('first_name');
  });

  it('converts PascalCase and acronym-heavy input', () => {
    expect(toSnakeCase('UserID')).toBe('user_id');
    expect(toCamelCase('UserID')).toBe('userId');
  });

  it('falls back to a default name for empty input', () => {
    expect(toPascalCase('')).toBe('Value');
    expect(toCamelCase('')).toBe('value');
    expect(toSnakeCase('')).toBe('value');
  });
});

describe('isValidIdentifier', () => {
  it('accepts valid identifiers', () => {
    expect(isValidIdentifier('firstName')).toBe(true);
    expect(isValidIdentifier('_id')).toBe(true);
  });

  it('rejects identifiers starting with a digit or containing punctuation', () => {
    expect(isValidIdentifier('2fast')).toBe(false);
    expect(isValidIdentifier('first-name')).toBe(false);
  });
});
