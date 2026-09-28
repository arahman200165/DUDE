import type { DuplicateFile, DuplicateGroup } from '../../../shared-logic/fs/fs-types';

export type { DuplicateFile, DuplicateGroup };

/**
 * Keep-rules and selection safety for Duplicate Files (Phase 29 items 2, 17). A rule picks the one
 * copy to keep in every group; the rest become Recycle Bin candidates. `trashCandidates` refuses a
 * selection that would remove every copy of anything — the one invariant a dedupe must never break.
 */

export type KeepRule = 'newest' | 'oldest' | 'shortest-path' | 'longest-path' | 'alphabetical' | 'in-folder';

export const KEEP_RULES: readonly { id: KeepRule; label: string }[] = [
  { id: 'oldest', label: 'Keep the oldest copy' },
  { id: 'newest', label: 'Keep the newest copy' },
  { id: 'shortest-path', label: 'Keep the shortest path' },
  { id: 'longest-path', label: 'Keep the longest path' },
  { id: 'alphabetical', label: 'Keep the first path A→Z' },
  { id: 'in-folder', label: 'Keep a copy inside folder…' },
];

export function keeperOf(group: DuplicateGroup, rule: KeepRule, folder = ''): DuplicateFile {
  const files = [...group.files];
  const byPath = (a: DuplicateFile, b: DuplicateFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  switch (rule) {
    case 'newest': return files.sort((a, b) => b.mtimeMs - a.mtimeMs || byPath(a, b))[0];
    case 'oldest': return files.sort((a, b) => a.mtimeMs - b.mtimeMs || byPath(a, b))[0];
    case 'shortest-path': return files.sort((a, b) => a.path.length - b.path.length || byPath(a, b))[0];
    case 'longest-path': return files.sort((a, b) => b.path.length - a.path.length || byPath(a, b))[0];
    case 'alphabetical': return files.sort(byPath)[0];
    case 'in-folder': {
      const prefix = folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
      const inside = files.filter((file) => prefix && (file.path.toLowerCase() === prefix || file.path.toLowerCase().startsWith(prefix + '/'))).sort(byPath);
      return inside[0] ?? files.sort(byPath)[0];
    }
  }
}

/** Every copy except each group's keeper. */
export function selectByRule(groups: readonly DuplicateGroup[], rule: KeepRule, folder = ''): Set<string> {
  const selected = new Set<string>();
  for (const group of groups) {
    const keep = keeperOf(group, rule, folder).path;
    for (const file of group.files) if (file.path !== keep) selected.add(file.path);
  }
  return selected;
}

export function trashCandidates(groups: readonly DuplicateGroup[], selected: ReadonlySet<string>): { paths: string[]; bytes: number } {
  const paths: string[] = [];
  let bytes = 0;
  for (const group of groups) {
    const chosen = group.files.filter((file) => selected.has(file.path));
    if (chosen.length && chosen.length === group.files.length) throw new Error(`Every copy of ${group.files[0].path} is selected — keep at least one.`);
    for (const file of chosen) { paths.push(file.path); bytes += file.size; }
  }
  return { paths, bytes };
}

export function groupsToCsv(groups: readonly DuplicateGroup[]): string {
  const cell = (value: string | number | boolean) => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  const lines = ['group,path,size,modified,identical_bytes'];
  groups.forEach((group, index) => { for (const file of group.files) lines.push([index + 1, file.path, file.size, new Date(file.mtimeMs).toISOString(), group.identicalBytes].map(cell).join(',')); });
  return lines.join('\n') + '\n';
}
