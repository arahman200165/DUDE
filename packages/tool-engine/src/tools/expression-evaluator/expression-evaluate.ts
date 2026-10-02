import { evaluate, format } from 'mathjs';

/**
 * Evaluates a math expression through mathjs's own restricted expression
 * language (not JavaScript `eval`) -- it has no access to the DOM, network,
 * or arbitrary JS, only arithmetic, a fixed function/constant library, units,
 * and matrices.
 */
export type ExpressionResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export function evaluateExpression(expression: string, scope: Readonly<Record<string, number>>): ExpressionResult {
  const trimmed = expression.trim();
  if (trimmed === '') return { ok: false, error: 'Enter an expression.' };

  try {
    const result: unknown = evaluate(trimmed, { ...scope });
    if (result === undefined) return { ok: false, error: 'Expression did not produce a value.' };
    return { ok: true, value: format(result) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not evaluate this expression.' };
  }
}

export interface ScopeEntry {
  readonly key: string;
  readonly value: string;
}

/** Ignores blank keys and non-numeric values rather than erroring, so a half-filled scope table still evaluates. */
export function parseScope(entries: readonly ScopeEntry[]): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const { key, value } of entries) {
    const trimmedKey = key.trim();
    if (trimmedKey === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) scope[trimmedKey] = num;
  }
  return scope;
}
