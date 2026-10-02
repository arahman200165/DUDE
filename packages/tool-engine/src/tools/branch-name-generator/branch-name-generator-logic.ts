/** Pure, framework-free branch-name assembly, built on `@sindresorhus/slugify` (already a dependency, used by Slug Generator). */
import slugify from '@sindresorhus/slugify';

export type BranchType = 'feature' | 'bugfix' | 'hotfix' | 'chore' | 'release' | 'none';

export interface BranchNameOptions {
  readonly type: BranchType;
  readonly ticket: string;
  readonly description: string;
  readonly maxLength: number;
}

export function generateBranchName(opts: BranchNameOptions): string {
  const parts: string[] = [];
  if (opts.type !== 'none') parts.push(opts.type);

  const ticket = opts.ticket
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
  const descriptionSlug = slugify(opts.description, { separator: '-' });

  const tail = [ticket, descriptionSlug].filter((part) => part !== '').join('-');
  if (tail !== '') parts.push(tail);

  let branch = parts.join('/');
  if (opts.maxLength > 0 && branch.length > opts.maxLength) {
    branch = branch.slice(0, opts.maxLength).replace(/[-/]+$/, '');
  }
  return branch;
}
