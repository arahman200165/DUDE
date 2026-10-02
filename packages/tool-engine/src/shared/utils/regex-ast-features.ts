import esm_regexp_tree from 'regexp-tree';
const { parse, traverse } = esm_regexp_tree;

import type { AstRegExp } from 'regexp-tree/ast';

/**
 * Detects a handful of regex feature flags via `regexp-tree`'s AST (falling
 * back to presence checks against the raw pattern source if it doesn't parse
 * cleanly). Originally written for Regex Tester's flavor-notes panel
 * (`tools/regex/regex-flavor-notes.ts`); the Regex Flavor Converter is the
 * second consumer, using it to decide when a target flavor can't represent a
 * construct the source pattern uses (e.g. Go RE2 has no lookaround at all).
 */
export interface DetectedFeatures {
  readonly hasNamedGroups: boolean;
  readonly hasLookbehind: boolean;
  readonly hasLookahead: boolean;
  readonly hasBackreference: boolean;
}

export function detectFeatures(pattern: string, flags: string): DetectedFeatures {
  try {
    const ast: AstRegExp = parse(new RegExp(pattern, (flags.match(/[gimsuy]/g) ?? []).join('')));

    let hasNamedGroups = false;
    let hasLookahead = false;
    let hasLookbehind = false;
    let hasBackreference = false;

    traverse(ast, {
      Group(path) {
        if (path.node.capturing && path.node.name) hasNamedGroups = true;
      },
      Assertion(path) {
        if (path.node.kind === 'Lookahead') hasLookahead = true;
        if (path.node.kind === 'Lookbehind') hasLookbehind = true;
      },
      Backreference() {
        hasBackreference = true;
      },
    });

    return { hasNamedGroups, hasLookbehind, hasLookahead, hasBackreference };
  } catch {
    return {
      hasNamedGroups: /\(\?<[^=!]/.test(pattern),
      hasLookbehind: /\(\?<[=!]/.test(pattern),
      hasLookahead: /\(\?[=!]/.test(pattern),
      hasBackreference: /\\\d/.test(pattern) || /\\k</.test(pattern),
    };
  }
}
