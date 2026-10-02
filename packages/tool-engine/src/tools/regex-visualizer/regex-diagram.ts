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
import RD from 'railroad-diagrams';
import type { DiagramPart } from 'railroad-diagrams';

/**
 * Regex → railroad-diagram builder. Walks the same `regexp-tree` AST node types
 * `regex-explain.ts` already walks (Disjunction/Alternative/Group/Repetition/
 * CharacterClass/Char/Assertion/Backreference), but builds a `railroad-diagrams`
 * `DiagramPart` tree instead of English prose lines.
 */
export type RegexDiagramResult = { readonly ok: true; readonly diagram: DiagramPart } | { readonly ok: false; readonly error: string };

const VALID_FLAG_CHARS = /[gimsuy]/g;

export function buildRegexDiagram(pattern: string, flags: string): RegexDiagramResult {
  if (pattern === '') return { ok: false, error: 'Enter a regular expression.' };

  let ast: AstRegExp;
  try {
    const cleanFlags = (flags.match(VALID_FLAG_CHARS) ?? []).join('');
    ast = parse(new RegExp(pattern, cleanFlags));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse this pattern for visualization.' };
  }

  const body = ast.body ? nodeToPart(ast.body) : RD.Comment('empty pattern');
  return { ok: true, diagram: RD.Diagram(body) };
}

function nodeToPart(node: Expression): DiagramPart {
  switch (node.type) {
    case 'Disjunction':
      return disjunctionToPart(node);
    case 'Alternative':
      return alternativeToPart(node);
    case 'Group':
      return groupToPart(node);
    case 'Repetition':
      return repetitionToPart(node);
    case 'CharacterClass':
      return RD.NonTerminal(characterClassLabel(node));
    case 'Char':
      return RD.Terminal(describeChar(node));
    case 'Assertion':
      return assertionToPart(node);
    case 'Backreference':
      return RD.NonTerminal(node.kind === 'name' ? `\\k<${node.reference}>` : `\\${node.reference}`);
    default:
      return RD.Comment('…');
  }
}

/** `regexp-tree` nests `a|b|c` as `Disjunction(Disjunction(a,b), c)` (left-associative) — flatten to a list first. */
function flattenDisjunction(node: Disjunction): readonly (Expression | null)[] {
  const left = node.left && node.left.type === 'Disjunction' ? flattenDisjunction(node.left) : [node.left];
  return [...left, node.right];
}

function disjunctionToPart(node: Disjunction): DiagramPart {
  const branches = flattenDisjunction(node).map((branch) => (branch ? nodeToPart(branch) : RD.Skip()));
  return RD.Choice(0, ...branches);
}

/** Coalesces consecutive plain-literal Char nodes into one Terminal run (e.g. "hello" instead of 5 boxes). */
function alternativeToPart(node: Alternative): DiagramPart {
  if (node.expressions.length === 0) return RD.Skip();

  const parts: DiagramPart[] = [];
  let literalRun = '';

  const flushLiteralRun = (): void => {
    if (literalRun !== '') {
      parts.push(RD.Terminal(literalRun));
      literalRun = '';
    }
  };

  for (const expr of node.expressions) {
    if (expr.type === 'Char' && expr.kind === 'simple') {
      literalRun += String.fromCodePoint(expr.codePoint);
    } else {
      flushLiteralRun();
      parts.push(nodeToPart(expr));
    }
  }
  flushLiteralRun();

  return parts.length === 1 ? parts[0] : RD.Sequence(...parts);
}

function groupToPart(node: Group): DiagramPart {
  const inner = node.expression ? nodeToPart(node.expression) : RD.Skip();
  if (!node.capturing) return inner;

  const label = node.name ? `group "${node.name}"` : `group #${node.number}`;
  return RD.Sequence(RD.Comment(label), inner);
}

function quantifierLabel(node: Repetition): string {
  const q = node.quantifier;
  const lazy = q.greedy ? '' : ', lazy';
  if (q.kind === 'Range') {
    const { from, to } = q;
    if (to === undefined) return `≥${from}${lazy}`;
    if (from === to) return `×${from}${lazy}`;
    return `${from}-${to}${lazy}`;
  }
  return lazy;
}

function repetitionToPart(node: Repetition): DiagramPart {
  const inner = nodeToPart(node.expression);
  const q = node.quantifier;

  if (q.kind === '*') return q.greedy ? RD.ZeroOrMore(inner) : RD.Sequence(RD.ZeroOrMore(inner), RD.Comment('lazy'));
  if (q.kind === '+') return q.greedy ? RD.OneOrMore(inner) : RD.Sequence(RD.OneOrMore(inner), RD.Comment('lazy'));
  if (q.kind === '?') return q.greedy ? RD.Optional(inner) : RD.Sequence(RD.Optional(inner), RD.Comment('lazy'));

  // Range ({n}, {n,}, {n,m}) has no dedicated railroad-diagrams primitive — annotate instead.
  return RD.Sequence(inner, RD.Comment(quantifierLabel(node)));
}

function describeClassMember(node: Char | ClassRange): string {
  if (node.type === 'ClassRange') return `${describeChar(node.from)}-${describeChar(node.to)}`;
  return describeChar(node);
}

function characterClassLabel(node: CharacterClass): string {
  const members = node.expressions.map(describeClassMember).join('');
  return `[${node.negative ? '^' : ''}${members}]`;
}

const META_LABELS: Record<string, string> = {
  '.': 'any char',
  '\\d': '\\d digit',
  '\\D': '\\D non-digit',
  '\\w': '\\w word char',
  '\\W': '\\W non-word char',
  '\\s': '\\s whitespace',
  '\\S': '\\S non-whitespace',
};

function describeChar(node: Char): string {
  if (node.kind === 'meta') return META_LABELS[node.value] ?? node.value;
  return String.fromCodePoint(node.codePoint);
}

const SIMPLE_ASSERTION_LABELS: Record<string, string> = {
  '^': 'start',
  $: 'end',
  '\\b': 'word boundary',
  '\\B': 'not word boundary',
};

function assertionToPart(node: Assertion): DiagramPart {
  if (node.kind === 'Lookahead' || node.kind === 'Lookbehind') {
    const direction = node.kind === 'Lookahead' ? 'followed by' : 'preceded by';
    const label = `${node.negative ? 'not ' : ''}${direction}:`;
    const inner = node.assertion ? nodeToPart(node.assertion) : RD.Skip();
    return RD.Sequence(RD.Comment(label), inner);
  }
  return RD.NonTerminal(SIMPLE_ASSERTION_LABELS[node.kind] ?? node.kind);
}
