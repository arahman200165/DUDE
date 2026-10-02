import esm_regexp_tree from 'regexp-tree';
const { parse } = esm_regexp_tree;

import type {
  Alternative,
  Assertion,
  AstRegExp,
  Backreference,
  Char,
  CharacterClass,
  ClassRange,
  Disjunction,
  Expression,
  Group,
  Repetition,
} from 'regexp-tree/ast';

/**
 * Rule-based (non-AI) plain-English regex explainer. Uses `regexp-tree` for
 * tokenization/AST rather than hand-rolling a character scanner — a
 * hand-rolled tokenizer risks mis-parsing escaped brackets, nested/escaped
 * parens, or named vs. non-capturing vs. lookaround group syntax.
 *
 * Deliberately decoupled from matching: if `regexp-tree` can't parse a
 * pattern (e.g. the newest `v`-flag/Unicode-set syntax it may not track),
 * this returns an error but native `RegExp` matching elsewhere in the tool
 * keeps working regardless.
 */

export interface RegexExplainLine {
  readonly depth: number;
  readonly text: string;
}

export type RegexExplainResult =
  | { readonly ok: true; readonly lines: readonly RegexExplainLine[] }
  | { readonly ok: false; readonly error: string };

const VALID_FLAG_CHARS = /[gimsuy]/g;

export function explainRegex(pattern: string, flags: string): RegexExplainResult {
  if (pattern === '') return { ok: false, error: 'Enter a regular expression.' };

  let ast: AstRegExp;
  try {
    const cleanFlags = (flags.match(VALID_FLAG_CHARS) ?? []).join('');
    ast = parse(new RegExp(pattern, cleanFlags));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse this pattern for explanation.' };
  }

  const lines: RegexExplainLine[] = [];
  push(lines, 0, 'Match:');
  if (ast.body) explainNode(ast.body, 1, lines);
  else push(lines, 1, 'an empty string');

  return { ok: true, lines };
}

function push(lines: RegexExplainLine[], depth: number, text: string): void {
  lines.push({ depth, text });
}

function explainNode(node: Expression, depth: number, lines: RegexExplainLine[]): void {
  switch (node.type) {
    case 'Disjunction':
      return explainDisjunction(node, depth, lines);
    case 'Alternative':
      return explainAlternative(node, depth, lines);
    case 'Group':
      return explainGroup(node, depth, lines);
    case 'Repetition':
      return explainRepetition(node, depth, lines);
    case 'CharacterClass':
      return explainCharacterClass(node, depth, lines);
    case 'Char':
      return push(lines, depth, describeChar(node));
    case 'Assertion':
      return explainAssertion(node, depth, lines);
    case 'Backreference':
      return explainBackreference(node, depth, lines);
    default:
      push(lines, depth, 'an expression');
  }
}

function explainDisjunction(node: Disjunction, depth: number, lines: RegexExplainLine[]): void {
  push(lines, depth, 'either:');
  if (node.left) explainNode(node.left, depth + 1, lines);
  push(lines, depth, 'or:');
  if (node.right) explainNode(node.right, depth + 1, lines);
}

function explainAlternative(node: Alternative, depth: number, lines: RegexExplainLine[]): void {
  for (const expr of node.expressions) explainNode(expr, depth, lines);
}

function explainGroup(node: Group, depth: number, lines: RegexExplainLine[]): void {
  if (node.capturing) {
    push(lines, depth, node.name ? `a capturing group named "${node.name}":` : `capturing group #${node.number}:`);
  } else {
    push(lines, depth, 'a non-capturing group:');
  }
  if (node.expression) explainNode(node.expression, depth + 1, lines);
}

function describeQuantifier(node: Repetition): string {
  const q = node.quantifier;
  const suffix = q.greedy ? '' : ' (as few times as possible)';

  switch (q.kind) {
    case '+':
      return `one or more times${suffix}`;
    case '*':
      return `zero or more times${suffix}`;
    case '?':
      return `zero or one time${suffix}`;
    case 'Range': {
      const { from, to } = q;
      if (to === undefined) return `${from} or more times${suffix}`;
      if (from === to) return `exactly ${from} time${from === 1 ? '' : 's'}${suffix}`;
      return `between ${from} and ${to} times${suffix}`;
    }
  }
}

function explainRepetition(node: Repetition, depth: number, lines: RegexExplainLine[]): void {
  push(lines, depth, `repeated ${describeQuantifier(node)}:`);
  explainNode(node.expression, depth + 1, lines);
}

function describeClassMember(node: Char | ClassRange): string {
  if (node.type === 'ClassRange') return `${describeChar(node.from)} through ${describeChar(node.to)}`;
  return describeChar(node);
}

function explainCharacterClass(node: CharacterClass, depth: number, lines: RegexExplainLine[]): void {
  const members = node.expressions.map(describeClassMember).join(', ');
  push(lines, depth, `${node.negative ? 'any character except' : 'one of'}: ${members}`);
}

const META_DESCRIPTIONS: Record<string, string> = {
  '.': 'any character except newline',
  '\\d': 'a digit (0-9)',
  '\\D': 'a non-digit',
  '\\w': 'a word character (letter, digit, or underscore)',
  '\\W': 'a non-word character',
  '\\s': 'a whitespace character',
  '\\S': 'a non-whitespace character',
};

function describeChar(node: Char): string {
  if (node.kind === 'meta') return META_DESCRIPTIONS[node.value] ?? `the special sequence ${node.value}`;
  return `the character "${String.fromCodePoint(node.codePoint)}"`;
}

const SIMPLE_ASSERTION_DESCRIPTIONS: Record<string, string> = {
  '^': 'the start of the string/line',
  $: 'the end of the string/line',
  '\\b': 'a word boundary',
  '\\B': 'a position that is not a word boundary',
};

function explainAssertion(node: Assertion, depth: number, lines: RegexExplainLine[]): void {
  if (node.kind === 'Lookahead' || node.kind === 'Lookbehind') {
    const direction = node.kind === 'Lookahead' ? 'followed by' : 'preceded by';
    const polarity = node.negative ? 'not ' : '';
    push(lines, depth, `must be ${polarity}${direction}:`);
    if (node.assertion) explainNode(node.assertion, depth + 1, lines);
    return;
  }
  push(lines, depth, SIMPLE_ASSERTION_DESCRIPTIONS[node.kind] ?? 'an assertion');
}

function explainBackreference(node: Backreference, depth: number, lines: RegexExplainLine[]): void {
  push(lines, depth, node.kind === 'name' ? `the same text matched by group "${node.reference}"` : `the same text matched by group #${node.reference}`);
}
