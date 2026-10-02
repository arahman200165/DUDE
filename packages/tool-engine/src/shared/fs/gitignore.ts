/**
 * Pure, framework-free `.gitignore` semantics: per-line anchoring, trailing-slash
 * directory-only matching, `!`-negation (later lines override earlier ones), and
 * implicit ignoring of everything nested under an ignored directory. Delegates the
 * actual glob-segment matching to `picomatch` (already a dependency, used by Glob
 * Pattern Tester) rather than hand-rolling wildcard matching too.
 */
import picomatch from 'picomatch';

export interface GitignoreRule {
  readonly raw: string;
  readonly negate: boolean;
  readonly directoryOnly: boolean;
  readonly isMatch: picomatch.Matcher;
}

function unescape(pattern: string): string {
  return pattern.replace(/\\(.)/g, '$1');
}

export function parseGitignoreRules(gitignoreText: string): readonly GitignoreRule[] {
  const rules: GitignoreRule[] = [];

  for (const rawLine of gitignoreText.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === '' || line.startsWith('#')) continue;

    let pattern = line;
    let negate = false;
    if (pattern.startsWith('!')) {
      negate = true;
      pattern = pattern.slice(1);
    }

    let directoryOnly = false;
    if (pattern.endsWith('/')) {
      directoryOnly = true;
      pattern = pattern.slice(0, -1);
    }

    const anchored = pattern.includes('/');
    if (pattern.startsWith('/')) pattern = pattern.slice(1);

    const globPattern = unescape(anchored ? pattern : `**/${pattern}`);
    if (globPattern === '') continue;

    let isMatch: picomatch.Matcher;
    try {
      isMatch = picomatch(globPattern, { dot: true });
    } catch {
      continue;
    }

    rules.push({ raw: line, negate, directoryOnly, isMatch });
  }

  return rules;
}

export interface GitignoreTestResult {
  readonly path: string;
  readonly ignored: boolean;
  readonly matchedRule?: string;
}

/** Paths ending in `/` are treated as directories; everything else as a file. */
export function testGitignorePaths(gitignoreText: string, paths: readonly string[]): readonly GitignoreTestResult[] {
  const rules = parseGitignoreRules(gitignoreText);

  return paths
    .map((path) => path.trim())
    .filter((path) => path !== '')
    .map((path) => {
      const isDirectory = path.endsWith('/');
      const normalizedPath = isDirectory ? path.slice(0, -1) : path;
      const segments = normalizedPath.split('/');

      let ignored = false;
      let matchedRule: string | undefined;

      for (const rule of rules) {
        let matched = (!rule.directoryOnly || isDirectory) && rule.isMatch(normalizedPath);

        if (!matched) {
          for (let i = 1; i < segments.length; i++) {
            if (rule.isMatch(segments.slice(0, i).join('/'))) {
              matched = true;
              break;
            }
          }
        }

        if (matched) {
          ignored = !rule.negate;
          matchedRule = rule.raw;
        }
      }

      return { path, ignored, matchedRule };
    });
}

/**
 * Last-matching-rule decision for one path relative to the rules' own directory — `true` ignored,
 * `false` re-included by a `!` rule, `undefined` when no rule speaks about it. The native walker
 * (`apps/desktop/fs-walk.ts`) stacks one rule set per `.gitignore` it meets and asks the deepest set
 * first, mirroring git's "closer file wins" precedence. Parent directories are pruned by the walker
 * itself, so unlike `testGitignorePaths` this never re-tests ancestor segments.
 */
export function matchGitignore(rules: readonly GitignoreRule[], relativePath: string, isDirectory: boolean): boolean | undefined {
  let decision: boolean | undefined;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    if (rule.isMatch(relativePath)) decision = !rule.negate;
  }
  return decision;
}

export interface GitignoreLayer {
  /** Posix path of the directory holding the rules, relative to the walk root ('' for the root). */
  readonly base: string;
  readonly rules: readonly GitignoreRule[];
}

/** Evaluates a stack of `.gitignore` layers (root first) for a root-relative posix path. */
export function isIgnoredByLayers(layers: readonly GitignoreLayer[], relativePath: string, isDirectory: boolean): boolean {
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index];
    if (layer.base && relativePath !== layer.base && !relativePath.startsWith(layer.base + '/')) continue;
    const local = layer.base ? relativePath.slice(layer.base.length + 1) : relativePath;
    if (!local) continue;
    const decision = matchGitignore(layer.rules, local, isDirectory);
    if (decision !== undefined) return decision;
  }
  return false;
}
