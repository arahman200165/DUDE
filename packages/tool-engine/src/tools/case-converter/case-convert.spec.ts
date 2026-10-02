import { convertCase, tokenize } from "./case-convert.js";

describe('tokenize', () => {
  it('splits camelCase', () => {
    expect(tokenize('fooBarBaz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('splits PascalCase', () => {
    expect(tokenize('FooBarBaz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('splits acronym boundaries', () => {
    expect(tokenize('XMLParser')).toEqual(['xml', 'parser']);
  });

  it('splits on delimiters', () => {
    expect(tokenize('foo_bar-baz.qux/quux')).toEqual(['foo', 'bar', 'baz', 'qux', 'quux']);
  });

  it('splits on whitespace', () => {
    expect(tokenize('  foo   bar  ')).toEqual(['foo', 'bar']);
  });

  it('returns an empty array for blank input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('convertCase', () => {
  const input = 'Hello World Example';

  it('converts to camelCase', () => {
    expect(convertCase(input, 'camel')).toBe('helloWorldExample');
  });

  it('converts to PascalCase', () => {
    expect(convertCase(input, 'pascal')).toBe('HelloWorldExample');
  });

  it('converts to snake_case', () => {
    expect(convertCase(input, 'snake')).toBe('hello_world_example');
  });

  it('converts to kebab-case', () => {
    expect(convertCase(input, 'kebab')).toBe('hello-world-example');
  });

  it('converts to CONSTANT_CASE', () => {
    expect(convertCase(input, 'constant')).toBe('HELLO_WORLD_EXAMPLE');
  });

  it('converts to Title Case', () => {
    expect(convertCase(input, 'title')).toBe('Hello World Example');
  });

  it('converts to Sentence case', () => {
    expect(convertCase(input, 'sentence')).toBe('Hello world example');
  });

  it('converts to dot.case', () => {
    expect(convertCase(input, 'dot')).toBe('hello.world.example');
  });

  it('converts to path/case', () => {
    expect(convertCase(input, 'path')).toBe('hello/world/example');
  });

  it('converts to aLtErNaTiNg cAsE', () => {
    expect(convertCase('abc def', 'alternating')).toBe('aBc DeF');
  });

  it('round-trips a camelCase input through every style without throwing', () => {
    for (const style of ['camel', 'pascal', 'snake', 'kebab', 'constant', 'title', 'sentence', 'dot', 'path', 'alternating'] as const) {
      expect(() => convertCase('someMixedInput_here-Now', style)).not.toThrow();
    }
  });

  it('returns an empty string for blank input regardless of style', () => {
    expect(convertCase('', 'camel')).toBe('');
    expect(convertCase('   ', 'title')).toBe('');
  });
});
