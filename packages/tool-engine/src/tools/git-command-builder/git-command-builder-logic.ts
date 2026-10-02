/** Pure, framework-free git command assembly from a per-subcommand field descriptor list. */

export type GitSubcommand = 'clone' | 'commit' | 'branch' | 'checkout' | 'merge' | 'rebase' | 'reset' | 'tag' | 'push' | 'pull' | 'log' | 'stash';

export interface GitFieldDef {
  readonly id: string;
  readonly label: string;
  readonly type: 'text' | 'boolean';
  readonly flag?: string;
  readonly placeholder?: string;
  readonly positional?: boolean;
  readonly quote?: boolean;
}

export type GitFieldValues = Record<string, string | boolean>;

export const GIT_SUBCOMMANDS: readonly GitSubcommand[] = [
  'clone',
  'commit',
  'branch',
  'checkout',
  'merge',
  'rebase',
  'reset',
  'tag',
  'push',
  'pull',
  'log',
  'stash',
];

export const GIT_SUBCOMMAND_FIELDS: Record<GitSubcommand, readonly GitFieldDef[]> = {
  clone: [
    { id: 'repository', label: 'Repository URL', type: 'text', positional: true, placeholder: 'https://github.com/user/repo.git' },
    { id: 'directory', label: 'Directory (optional)', type: 'text', positional: true },
    { id: 'branch', label: 'Branch', type: 'text', flag: '--branch' },
    { id: 'depth', label: 'Depth', type: 'text', flag: '--depth' },
    { id: 'recurseSubmodules', label: 'Recurse submodules', type: 'boolean', flag: '--recurse-submodules' },
  ],
  commit: [
    { id: 'message', label: 'Message', type: 'text', flag: '-m', quote: true },
    { id: 'all', label: 'All tracked changes (-a)', type: 'boolean', flag: '-a' },
    { id: 'amend', label: 'Amend previous commit (--amend)', type: 'boolean', flag: '--amend' },
    { id: 'noEdit', label: 'No edit (--no-edit)', type: 'boolean', flag: '--no-edit' },
  ],
  branch: [
    { id: 'name', label: 'Branch name', type: 'text', positional: true },
    { id: 'delete', label: 'Delete (-d)', type: 'boolean', flag: '-d' },
    { id: 'all', label: 'List all (-a)', type: 'boolean', flag: '-a' },
  ],
  checkout: [
    { id: 'target', label: 'Branch / commit', type: 'text', positional: true },
    { id: 'newBranch', label: 'New branch name (-b)', type: 'text', flag: '-b' },
  ],
  merge: [
    { id: 'branch', label: 'Branch to merge', type: 'text', positional: true },
    { id: 'noFf', label: 'No fast-forward (--no-ff)', type: 'boolean', flag: '--no-ff' },
    { id: 'squash', label: 'Squash (--squash)', type: 'boolean', flag: '--squash' },
  ],
  rebase: [
    { id: 'upstream', label: 'Upstream', type: 'text', positional: true },
    { id: 'interactive', label: 'Interactive (-i)', type: 'boolean', flag: '-i' },
    { id: 'onto', label: 'Onto', type: 'text', flag: '--onto' },
  ],
  reset: [
    { id: 'commit', label: 'Commit', type: 'text', positional: true, placeholder: 'HEAD~1' },
    { id: 'soft', label: 'Soft (--soft)', type: 'boolean', flag: '--soft' },
    { id: 'mixed', label: 'Mixed (--mixed)', type: 'boolean', flag: '--mixed' },
    { id: 'hard', label: 'Hard (--hard)', type: 'boolean', flag: '--hard' },
  ],
  tag: [
    { id: 'name', label: 'Tag name', type: 'text', positional: true },
    { id: 'annotate', label: 'Annotated (-a)', type: 'boolean', flag: '-a' },
    { id: 'message', label: 'Message (-m)', type: 'text', flag: '-m', quote: true },
    { id: 'delete', label: 'Delete (-d)', type: 'boolean', flag: '-d' },
  ],
  push: [
    { id: 'remote', label: 'Remote', type: 'text', positional: true, placeholder: 'origin' },
    { id: 'branch', label: 'Branch', type: 'text', positional: true },
    { id: 'setUpstream', label: 'Set upstream (-u)', type: 'boolean', flag: '-u' },
    { id: 'force', label: 'Force (-f)', type: 'boolean', flag: '-f' },
    { id: 'tags', label: 'Tags (--tags)', type: 'boolean', flag: '--tags' },
  ],
  pull: [
    { id: 'remote', label: 'Remote', type: 'text', positional: true, placeholder: 'origin' },
    { id: 'branch', label: 'Branch', type: 'text', positional: true },
    { id: 'rebase', label: 'Rebase (--rebase)', type: 'boolean', flag: '--rebase' },
  ],
  log: [
    { id: 'oneline', label: 'One line (--oneline)', type: 'boolean', flag: '--oneline' },
    { id: 'graph', label: 'Graph (--graph)', type: 'boolean', flag: '--graph' },
    { id: 'count', label: 'Count (-n)', type: 'text', flag: '-n' },
  ],
  stash: [{ id: 'mode', label: 'push / pop / list / drop', type: 'text', positional: true, placeholder: 'push' }],
};

export function buildGitCommand(subcommand: GitSubcommand, values: GitFieldValues): string {
  const positionals: string[] = [];
  const flags: string[] = [];

  for (const field of GIT_SUBCOMMAND_FIELDS[subcommand]) {
    const value = values[field.id];
    if (field.type === 'boolean') {
      if (value === true && field.flag) flags.push(field.flag);
      continue;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') continue;

    if (field.positional) {
      positionals.push(text);
    } else if (field.flag) {
      flags.push(`${field.flag} ${field.quote ? `"${text.replace(/"/g, '\\"')}"` : text}`);
    }
  }

  return ['git', subcommand, ...flags, ...positionals].filter((part) => part !== '').join(' ');
}
