import esm_regexp_tree from 'regexp-tree';
const { parse, traverse } = esm_regexp_tree;

import type { AstRegExp, Expression, Repetition } from 'regexp-tree/ast';

/**
 * Static, heuristic catastrophic-backtracking (ReDoS) risk scan over the same
 * `regexp-tree` AST `regex-explain.ts`/`regex-flavor-notes.ts` already parse.
 * Flags the two classic shapes — a nested unbounded quantifier (`(a+)+`,
 * `(a*)*`) and an unbounded quantifier wrapping alternation (`(a|ab)+`) —
 * without attempting real character-class-overlap analysis (a decidable but
 * genuinely hard problem). Deliberately over-inclusive: a false positive here
 * costs nothing but a flagged pattern that turns out fine; a false negative
 * would give false confidence in a pattern that can actually hang a browser
 * tab. Findings are signals, not verdicts, per the same framing as Phase 15's
 * URL Safety Inspector.
 */
export interface CatastrophicRiskFinding {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: 'info' | 'warning';
}

function isUnbounded(node: Repetition): boolean {
  const q = node.quantifier;
  if (q.kind === '+' || q.kind === '*') return true;
  return q.kind === 'Range' && q.to === undefined;
}

/** Unwraps a single non-capturing/capturing group to look at what it directly contains. */
function unwrapGroup(node: Expression | null): Expression | null {
  if (node && node.type === 'Group') return node.expression;
  return node;
}

function containsUnboundedRepetition(node: Expression | null): boolean {
  if (!node) return false;

  switch (node.type) {
    case 'Repetition':
      return isUnbounded(node) || containsUnboundedRepetition(node.expression);
    case 'Group':
      return containsUnboundedRepetition(node.expression);
    case 'Alternative':
      return node.expressions.some(containsUnboundedRepetition);
    case 'Disjunction':
      return containsUnboundedRepetition(node.left) || containsUnboundedRepetition(node.right);
    default:
      return false;
  }
}

export function findCatastrophicBacktrackingRisks(pattern: string, flags: string): readonly CatastrophicRiskFinding[] {
  let ast: AstRegExp;
  try {
    const cleanFlags = (flags.match(/[gimsuy]/g) ?? []).join('');
    ast = parse(new RegExp(pattern, cleanFlags));
  } catch {
    return [];
  }

  let hasNestedQuantifier = false;
  let hasQuantifiedAlternation = false;

  traverse(ast, {
    Repetition(path) {
      if (!isUnbounded(path.node)) return;

      if (containsUnboundedRepetition(path.node.expression)) hasNestedQuantifier = true;

      const inner = unwrapGroup(path.node.expression);
      if (inner && inner.type === 'Disjunction') hasQuantifiedAlternation = true;
    },
  });

  const findings: CatastrophicRiskFinding[] = [];

  if (hasNestedQuantifier) {
    findings.push({
      id: 'nested-quantifier',
      title: 'Nested unbounded quantifier',
      detail: 'An unbounded quantifier (+ or *) contains another one inside it — the classic shape behind catastrophic backtracking (e.g. (a+)+). Not a guarantee it will hang, but worth timing against a worst-case input below.',
      severity: 'warning',
    });
  }

  if (hasQuantifiedAlternation) {
    findings.push({
      id: 'quantified-alternation',
      title: 'Unbounded quantifier around alternation',
      detail: 'An unbounded quantifier wraps a group of alternatives (e.g. (a|ab)+) — if the branches can match overlapping text, the engine may try exponentially many ways to split the input.',
      severity: 'warning',
    });
  }

  return findings;
}
