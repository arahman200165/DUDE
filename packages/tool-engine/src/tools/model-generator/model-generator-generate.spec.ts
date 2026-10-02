import { describe, expect, it } from 'vitest';
import { generateModel } from "./model-generator-generate.js";

describe('generateModel', () => {
  it('generates TypeScript from a nested JSON sample', () => {
    const result = generateModel('{"id": 1, "address": {"city": "NYC"}}', 'user', 'typescript');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toContain('export interface User {');
      expect(result.code).toContain('export interface Address {');
    }
  });

  it('generates a SQL CREATE TABLE from an array of flat records', () => {
    const result = generateModel('[{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]', 'item', 'sql');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toContain('CREATE TABLE item (');
    }
  });

  it('surfaces an error for invalid JSON without throwing', () => {
    const result = generateModel('not json', 'root', 'python');
    expect(result.ok).toBe(false);
  });

  it('defaults the root name to Root when left blank', () => {
    const result = generateModel('{"id": 1}', '  ', 'go');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toContain('type Root struct {');
    }
  });
});
