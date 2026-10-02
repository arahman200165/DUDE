/**
 * Pure, framework-free explanation of an arbitrary pasted git command,
 * token by token, against a curated per-subcommand flag dictionary.
 */

/** Minimal quote-aware whitespace tokenizer — good enough for git's own argument grammar (no `$VAR`/backtick expansion to worry about). */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current !== '') tokens.push(current);
  return tokens;
}

export type GitTokenKind = 'command' | 'subcommand' | 'flag' | 'positional' | 'unknown';

export interface GitTokenExplanation {
  readonly text: string;
  readonly kind: GitTokenKind;
  readonly description: string;
}

const SUBCOMMAND_DESCRIPTIONS: Record<string, string> = {
  clone: 'Clones a repository into a new directory.',
  commit: 'Records staged changes as a new commit.',
  branch: 'Lists, creates, or deletes branches.',
  checkout: 'Switches branches, or restores working-tree files.',
  switch: 'Switches the current branch.',
  merge: 'Joins two or more development histories together.',
  rebase: 'Reapplies commits on top of another base tip.',
  reset: 'Resets the current HEAD to a specified state.',
  tag: 'Creates, lists, deletes, or verifies a tag object.',
  push: 'Updates a remote branch with local commits.',
  pull: 'Fetches from and integrates with a remote branch.',
  fetch: 'Downloads objects and refs from another repository.',
  log: 'Shows commit logs.',
  stash: 'Temporarily shelves (or restores) uncommitted changes.',
  status: 'Shows the working tree status.',
  diff: 'Shows changes between commits, the working tree, and more.',
  add: 'Adds file contents to the index.',
  init: 'Creates an empty git repository or reinitializes an existing one.',
  remote: 'Manages the set of tracked remote repositories.',
};

const COMMON_FLAG_DESCRIPTIONS: Record<string, string> = {
  '-v': 'Verbose output.',
  '--verbose': 'Verbose output.',
  '-f': 'Force the operation.',
  '--force': 'Force the operation.',
  '--all': 'Apply to all applicable refs/files.',
  '--dry-run': "Show what would happen without actually doing it.",
  '--no-verify': 'Bypass pre-commit and commit-msg hooks.',
  '-n': 'Dry run (context-dependent) or a numeric limit.',
};

const SUBCOMMAND_FLAG_DESCRIPTIONS: Record<string, Record<string, string>> = {
  clone: {
    '--branch': 'Clone and checkout the given branch instead of the default.',
    '--depth': 'Create a shallow clone with a truncated history.',
    '--recurse-submodules': 'Initialize and clone submodules within the cloned repository.',
  },
  commit: {
    '-m': 'Sets the commit message inline.',
    '--message': 'Sets the commit message inline.',
    '-a': 'Automatically stage all tracked, modified files before committing.',
    '--amend': 'Replaces the tip of the current branch by creating a new commit.',
    '--no-edit': 'Reuse the previous commit message without launching an editor.',
  },
  branch: {
    '-d': 'Delete a branch (only if fully merged).',
    '-D': 'Force-delete a branch.',
    '-m': 'Rename a branch.',
    '-r': 'List or act on remote-tracking branches.',
  },
  checkout: {
    '-b': 'Create a new branch and switch to it.',
    '-B': 'Create or reset a branch and switch to it.',
  },
  merge: {
    '--no-ff': 'Always create a merge commit, even if a fast-forward was possible.',
    '--squash': 'Combine the merged changes into a single set of pending changes.',
    '--abort': 'Abort the current conflict resolution and reconstruct the pre-merge state.',
  },
  rebase: {
    '-i': 'Interactive rebase — edit, reorder, or squash commits before reapplying them.',
    '--interactive': 'Interactive rebase — edit, reorder, or squash commits before reapplying them.',
    '--onto': 'Rebase onto a given commit instead of the upstream.',
    '--abort': 'Abort the rebase and restore the original branch state.',
    '--continue': 'Continue the rebase after resolving a conflict.',
  },
  reset: {
    '--soft': 'Move HEAD only, keeping the index and working tree unchanged.',
    '--mixed': 'Move HEAD and reset the index, keeping working-tree files unchanged (default).',
    '--hard': 'Move HEAD and reset the index and working tree, discarding local changes.',
  },
  tag: {
    '-a': 'Create an annotated tag.',
    '-m': 'Sets the tag message inline (with -a).',
    '-d': 'Delete a tag.',
  },
  push: {
    '-u': 'Set the pushed branch as the upstream for the local branch.',
    '--set-upstream': 'Set the pushed branch as the upstream for the local branch.',
    '--tags': 'Push all local tags.',
  },
  pull: {
    '--rebase': 'Rebase local commits on top of the fetched history, instead of merging.',
  },
  log: {
    '--oneline': 'Show each commit on a single, abbreviated line.',
    '--graph': 'Draw a text-based commit graph.',
  },
};

function explainFlag(subcommand: string, flag: string): string {
  return SUBCOMMAND_FLAG_DESCRIPTIONS[subcommand]?.[flag] ?? COMMON_FLAG_DESCRIPTIONS[flag] ?? 'Unrecognized flag.';
}

/** Flags whose next non-flag token is their argument, not an independent positional. */
const VALUE_TAKING_FLAGS = new Set(['-m', '--message', '--branch', '--depth', '--onto', '-b', '-B']);

export function explainGitCommand(raw: string): readonly GitTokenExplanation[] {
  const tokens = tokenize(raw.trim());
  if (tokens.length === 0) return [];

  const result: GitTokenExplanation[] = [];
  let index = 0;

  if (tokens[0] === 'git') {
    result.push({ text: 'git', kind: 'command', description: 'The git CLI.' });
    index = 1;
  }

  const subcommand = tokens[index];
  if (subcommand === undefined) return result;
  result.push({
    text: subcommand,
    kind: 'subcommand',
    description: SUBCOMMAND_DESCRIPTIONS[subcommand] ?? 'Unrecognized subcommand.',
  });
  index++;

  for (; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.startsWith('-')) {
      result.push({ text: token, kind: 'flag', description: explainFlag(subcommand, token) });

      if (VALUE_TAKING_FLAGS.has(token) && index + 1 < tokens.length && !tokens[index + 1].startsWith('-')) {
        index++;
        result.push({ text: tokens[index], kind: 'positional', description: `Value for ${token}.` });
      }
    } else {
      result.push({ text: token, kind: 'positional', description: 'Positional argument.' });
    }
  }

  return result;
}
