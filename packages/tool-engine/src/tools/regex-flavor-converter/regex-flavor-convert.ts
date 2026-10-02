import esm_regexp_tree from 'regexp-tree';
const { parse } = esm_regexp_tree;

import type {
  Alternative,
  Assertion,
  AstRegExp,
  Backreference,
  Char,
  CharacterClass,
  Disjunction,
  Expression,
  Group,
  Quantifier,
  Repetition,
} from 'regexp-tree/ast';
import { detectFeatures } from "../../shared/utils/regex-ast-features.js";

/**
 * `regexp-tree` can only *parse* JS-flavored source — there's no parser in this
 * codebase for .NET/Java/Python/PCRE/Go syntax. So a non-JS source flavor goes
 * through a small textual normalization pass first (named-group/backreference
 * syntax only, the most common purely-syntactic cross-flavor variance) before
 * `parse()`, then the resulting AST is re-emitted in the target flavor's
 * syntax. A source construct that survives normalization but the target can't
 * represent at all (Go has no lookaround/backreferences) is emitted as-is with
 * a disclosed warning, never silently dropped or silently wrong.
 */
export type ConverterFlavor = 'js' | 'python' | 'java' | 'dotnet' | 'pcre' | 'go';

export const CONVERTER_FLAVORS: Record<ConverterFlavor, string> = {
  js: 'JavaScript',
  python: 'Python re',
  java: 'Java',
  dotnet: '.NET',
  pcre: 'PCRE',
  go: 'Go RE2',
};

export type FlavorConvertResult =
  | { readonly ok: true; readonly output: string; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

interface Normalized {
  readonly pattern: string;
  readonly warnings: readonly string[];
}

function normalizeToJsSyntax(pattern: string, source: ConverterFlavor): Normalized {
  const warnings: string[] = [];
  let normalized = pattern;

  if (source === 'python') {
    normalized = normalized.replace(/\(\?P<([^>]+)>/g, '(?<$1>').replace(/\(\?P=([A-Za-z_]\w*)\)/g, '\\k<$1>');
  } else if (source === 'dotnet') {
    normalized = normalized.replace(/\(\?'([^']+)'/g, '(?<$1>');
  } else if (source === 'go') {
    normalized = normalized.replace(/\(\?P<([^>]+)>/g, '(?<$1>');
  } else if (source === 'pcre') {
    normalized = normalized
      .replace(/\(\?P<([^>]+)>/g, '(?<$1>')
      .replace(/\(\?'([^']+)'/g, '(?<$1>')
      .replace(/\(\?P=([A-Za-z_]\w*)\)/g, '\\k<$1>')
      .replace(/\\k'([^']+)'/g, '\\k<$1>');

    if (/[+*?}]\+/.test(normalized)) {
      normalized = normalized.replace(/([+*?}])\+/g, '$1');
      warnings.push('Possessive quantifiers (e.g. a++) were approximated as their greedy equivalent — atomic/no-backtracking behavior is lost.');
    }
    if (/\(\?>/.test(normalized)) {
      normalized = normalized.replace(/\(\?>/g, '(?:');
      warnings.push('Atomic groups (?>...) were approximated as plain non-capturing groups — no-backtracking behavior is lost.');
    }
  }

  return { pattern: normalized, warnings };
}

function emitQuantifier(q: Quantifier): string {
  const lazy = q.greedy ? '' : '?';
  if (q.kind === '+') return `+${lazy}`;
  if (q.kind === '*') return `*${lazy}`;
  if (q.kind === '?') return `?${lazy}`;
  if (q.kind !== 'Range') return lazy;

  const { from, to } = q;
  if (to === undefined) return `{${from},}${lazy}`;
  if (from === to) return `{${from}}${lazy}`;
  return `{${from},${to}}${lazy}`;
}

function emitChar(node: Char): string {
  if (node.kind !== 'simple') return node.value;
  return node.escaped ? `\\${node.value}` : node.value;
}

function emitCharacterClass(node: CharacterClass): string {
  const members = node.expressions
    .map((member) => (member.type === 'ClassRange' ? `${emitChar(member.from)}-${emitChar(member.to)}` : emitChar(member)))
    .join('');
  return `[${node.negative ? '^' : ''}${members}]`;
}

function emitGroup(node: Group, target: ConverterFlavor): string {
  const inner = node.expression ? emit(node.expression, target) : '';
  if (!node.capturing) return `(?:${inner})`;
  if (node.name) {
    const opening = target === 'python' ? `(?P<${node.name}>` : `(?<${node.name}>`;
    return `${opening}${inner})`;
  }
  return `(${inner})`;
}

function emitBackreference(node: Backreference, target: ConverterFlavor): string {
  if (node.kind === 'number') return `\\${node.reference}`;
  return target === 'python' ? `(?P=${node.reference})` : `\\k<${node.reference}>`;
}

function emitAssertion(node: Assertion, target: ConverterFlavor): string {
  if (node.kind === 'Lookahead' || node.kind === 'Lookbehind') {
    const inner = node.assertion ? emit(node.assertion, target) : '';
    const prefix = node.kind === 'Lookahead' ? (node.negative ? '(?!' : '(?=') : node.negative ? '(?<!' : '(?<=';
    return `${prefix}${inner})`;
  }
  return node.kind;
}

function emitDisjunction(node: Disjunction, target: ConverterFlavor): string {
  const left = node.left ? emit(node.left, target) : '';
  const right = node.right ? emit(node.right, target) : '';
  return `${left}|${right}`;
}

function emitAlternative(node: Alternative, target: ConverterFlavor): string {
  return node.expressions.map((expr) => emit(expr, target)).join('');
}

function emit(node: Expression, target: ConverterFlavor): string {
  switch (node.type) {
    case 'Disjunction':
      return emitDisjunction(node, target);
    case 'Alternative':
      return emitAlternative(node, target);
    case 'Group':
      return emitGroup(node, target);
    case 'Repetition':
      return `${emit(node.expression, target)}${emitQuantifier(node.quantifier)}`;
    case 'CharacterClass':
      return emitCharacterClass(node);
    case 'Char':
      return emitChar(node);
    case 'Assertion':
      return emitAssertion(node, target);
    case 'Backreference':
      return emitBackreference(node, target);
    default:
      return '';
  }
}

function targetWarnings(pattern: string, flags: string, target: ConverterFlavor): readonly string[] {
  const features = detectFeatures(pattern, flags);
  const warnings: string[] = [];

  if (target === 'go') {
    if (features.hasLookahead || features.hasLookbehind) {
      warnings.push('Go RE2 does not support lookahead or lookbehind — the emitted pattern below will not compile in Go.');
    }
    if (features.hasBackreference) {
      warnings.push('Go RE2 does not support backreferences — the emitted pattern below will not compile in Go.');
    }
  }

  if (target === 'java' && features.hasLookbehind) {
    warnings.push("Java requires lookbehind to have a bounded (non-unbounded-*) length — verify this pattern's lookbehind qualifies.");
  }

  return warnings;
}

export function convertRegexFlavor(pattern: string, flags: string, source: ConverterFlavor, target: ConverterFlavor): FlavorConvertResult {
  if (pattern === '') return { ok: false, error: 'Enter a regular expression.' };

  const { pattern: normalized, warnings: normalizeWarnings } = normalizeToJsSyntax(pattern, source);

  let ast: AstRegExp;
  try {
    const cleanFlags = (flags.match(/[gimsuy]/g) ?? []).join('');
    ast = parse(new RegExp(normalized, cleanFlags));
  } catch (error) {
    const sourceNote = source !== 'js' ? ` (after normalizing from ${CONVERTER_FLAVORS[source]} syntax)` : '';
    const message = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: `Could not parse this pattern${sourceNote}: ${message}` };
  }

  const output = ast.body ? emit(ast.body, target) : '';
  const warnings = [...normalizeWarnings, ...targetWarnings(normalized, flags, target)];

  return { ok: true, output, warnings };
}
