import { describe, expect, it } from 'vitest';
import { evaluateExpression, parseScope } from "./expression-evaluate.js";

describe('evaluateExpression', () => {
  it('evaluates basic arithmetic with operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toEqual({ ok: true, value: '14' });
  });

  it('evaluates built-in functions', () => {
    expect(evaluateExpression('sqrt(16) + sin(0)', {})).toEqual({ ok: true, value: '4' });
  });

  it('substitutes variables from scope', () => {
    expect(evaluateExpression('x^2 + y', { x: 3, y: 4 })).toEqual({ ok: true, value: '13' });
  });

  it('formats a matrix result', () => {
    expect(evaluateExpression('[1, 2, 3] + [4, 5, 6]', {})).toEqual({ ok: true, value: '[5, 7, 9]' });
  });

  it('rejects empty input', () => {
    expect(evaluateExpression('', {}).ok).toBe(false);
  });

  it('rejects a syntax error', () => {
    expect(evaluateExpression('2 +', {}).ok).toBe(false);
  });

  it('has no access to undefined/unsafe functions like import', () => {
    expect(evaluateExpression('import("fs")', {}).ok).toBe(false);
  });
});

describe('parseScope', () => {
  it('builds a numeric scope, skipping blank keys and non-numeric values', () => {
    expect(
      parseScope([
        { key: 'x', value: '3' },
        { key: '', value: '99' },
        { key: 'y', value: 'not a number' },
        { key: 'z', value: '4.5' },
      ]),
    ).toEqual({ x: 3, z: 4.5 });
  });

  it('returns an empty scope for no entries', () => {
    expect(parseScope([])).toEqual({});
  });
});
