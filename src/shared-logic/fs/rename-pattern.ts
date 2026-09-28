import slugify from '@sindresorhus/slugify';

/**
 * Batch Rename's naming engine (Phase 29 item 3, Milestone 530). Pure and shared: the renderer runs
 * it live for the preview as you type, and the fs worker runs it again, authoritatively, when it
 * builds the rename plan. Every proposed name is validated against Windows' rules, and collisions
 * (two items → one name, or a name that already exists and isn't itself being renamed away) are
 * flagged before anything reaches the mutation engine.
 */

export interface RenameEntry {
  /** Root-relative posix path. */
  readonly path: string;
  readonly kind: 'file' | 'dir';
  readonly size: number;
  readonly mtimeMs: number;
  /** First 8 hex chars of the file's SHA-256, for `{hash8}` (worker-filled). */
  readonly hash8?: string;
}

export type RenameTarget = 'name' | 'extension' | 'full';
export type CaseTransform = 'none' | 'lower' | 'upper' | 'title' | 'slug';
export type RenameSort = 'path' | 'name' | 'mtime' | 'size';

export interface RenameOptions {
  readonly mode: 'pattern' | 'list';
  readonly find: string;
  readonly replace: string;
  readonly regex: boolean;
  readonly caseSensitive: boolean;
  readonly target: RenameTarget;
  readonly caseTransform: CaseTransform;
  /** Tokens: {name} {.ext} {ext} {n} {n:000} {parent} {size} {mtime:yyyy-MM-dd} {hash8}. */
  readonly template: string;
  readonly counterStart: number;
  readonly counterStep: number;
  readonly sort: RenameSort;
  /** List mode: `old -> new`, `old => new`, `old<TAB>new` or `old,new` per line (root-relative paths). */
  readonly list: string;
}

export const DEFAULT_RENAME: RenameOptions = {
  mode: 'pattern', find: '', replace: '', regex: false, caseSensitive: false, target: 'name', caseTransform: 'none',
  template: '{name}{.ext}', counterStart: 1, counterStep: 1, sort: 'path', list: '',
};

export type RenameStatus = 'rename' | 'unchanged' | 'invalid' | 'collision' | 'exists';

export interface RenameProposal {
  readonly path: string;
  readonly kind: 'file' | 'dir';
  readonly name: string;
  readonly newName: string;
  /** Root-relative posix path of the renamed item (same folder). */
  readonly to: string;
  readonly status: RenameStatus;
  readonly reason?: string;
  /** Non-blocking notes, e.g. a path longer than the classic 260-character limit. */
  readonly warning?: string;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/;

/** Why `name` can't be a Windows file name, or null when it can. */
export function invalidWindowsName(name: string): string | null {
  if (!name) return 'The new name is empty.';
  if (name === '.' || name === '..') return 'That name is reserved.';
  if (ILLEGAL.test(name)) return 'Names can’t contain < > : " / \\ | ? * or control characters.';
  if (/[. ]$/.test(name)) return 'Windows drops a trailing dot or space from names.';
  if (RESERVED.test(name)) return `“${name.split('.')[0]}” is a reserved device name on Windows.`;
  if (name.length > 255) return 'Names are limited to 255 characters.';
  return null;
}

export function splitName(name: string, kind: 'file' | 'dir'): { base: string; ext: string } {
  if (kind === 'dir') return { base: name, ext: '' };
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot + 1) } : { base: name, ext: '' };
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s_\-.(\[])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

function transformCase(value: string, transform: CaseTransform): string {
  switch (transform) {
    case 'none': return value;
    case 'lower': return value.toLowerCase();
    case 'upper': return value.toUpperCase();
    case 'title': return titleCase(value);
    case 'slug': return slugify(value);
  }
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function compileFind(options: Pick<RenameOptions, 'find' | 'regex' | 'caseSensitive'>): RegExp | null {
  if (!options.find) return null;
  try { return new RegExp(options.regex ? options.find : escapeRegex(options.find), `gu${options.caseSensitive ? '' : 'i'}`); }
  catch (error) { throw new Error(`Invalid pattern: ${error instanceof Error ? error.message : String(error)}`); }
}

function pad(value: number, width: number): string { return String(value).padStart(width, '0'); }

export function formatDate(time: number, format: string): string {
  const date = new Date(time);
  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => {
    switch (token) {
      case 'yyyy': return String(date.getFullYear());
      case 'MM': return pad(date.getMonth() + 1, 2);
      case 'dd': return pad(date.getDate(), 2);
      case 'HH': return pad(date.getHours(), 2);
      case 'mm': return pad(date.getMinutes(), 2);
      default: return pad(date.getSeconds(), 2);
    }
  });
}

function parentName(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts[parts.length - 2] : '';
}

function renderTemplate(template: string, values: { name: string; ext: string; n: number; parent: string; size: number; mtimeMs: number; hash8?: string }): string {
  return template.replace(/\{(\.ext|ext|name|parent|size|hash8|n(?::(0+))?|mtime(?::([^}]+))?)\}/g, (_whole, token: string, zeros?: string, dateFormat?: string) => {
    if (token === '.ext') return values.ext ? `.${values.ext}` : '';
    if (token === 'ext') return values.ext;
    if (token === 'name') return values.name;
    if (token === 'parent') return values.parent;
    if (token === 'size') return String(values.size);
    if (token === 'hash8') return values.hash8 ?? '{hash8}';
    if (token.startsWith('n')) return zeros ? pad(values.n, zeros.length) : String(values.n);
    return formatDate(values.mtimeMs, dateFormat ?? 'yyyy-MM-dd');
  });
}

/** Parses list mode into old → new root-relative paths (new may be just a name, meaning same folder). */
export function parseRenameList(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(.+?)\s*(?:->|=>|\t|,)\s*(.+)$/.exec(line);
    if (match) map.set(match[1].trim().replace(/\\/g, '/').replace(/^"|"$/g, ''), match[2].trim().replace(/\\/g, '/').replace(/^"|"$/g, ''));
  }
  return map;
}

function sortEntries(entries: readonly RenameEntry[], sort: RenameSort): RenameEntry[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  const copy = [...entries];
  if (sort === 'name') return copy.sort((a, b) => collator.compare(nameOf(a.path), nameOf(b.path)));
  if (sort === 'mtime') return copy.sort((a, b) => a.mtimeMs - b.mtimeMs || collator.compare(a.path, b.path));
  if (sort === 'size') return copy.sort((a, b) => a.size - b.size || collator.compare(a.path, b.path));
  return copy.sort((a, b) => collator.compare(a.path, b.path));
}

/**
 * Proposes a new name for every entry. `existing` lists every name already present in each folder
 * (posix folder path → lower-cased names), used to catch clashes with files that aren't renamed.
 */
export function computeRenames(entries: readonly RenameEntry[], options: RenameOptions, existing: ReadonlyMap<string, ReadonlySet<string>> = new Map()): RenameProposal[] {
  const find = options.mode === 'pattern' ? compileFind(options) : null;
  const list = options.mode === 'list' ? parseRenameList(options.list) : null;
  const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  const drafts = sortEntries(entries, options.sort).map((entry, index) => {
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    let newName: string;
    if (list) {
      const mapped = list.get(entry.path) ?? list.get(name);
      newName = mapped ? mapped.slice(mapped.lastIndexOf('/') + 1) : name;
    } else {
      const { base, ext } = splitName(name, entry.kind);
      const part = options.target === 'full' ? name : options.target === 'extension' ? ext : base;
      let changed = find ? part.replace(find, options.regex ? options.replace : options.replace.replace(/\$/g, '$$$$')) : part;
      changed = transformCase(changed, options.caseTransform);
      const values = options.target === 'full'
        ? { name: changed, ext: '' }
        : options.target === 'extension' ? { name: base, ext: changed } : { name: changed, ext };
      newName = renderTemplate(options.template || '{name}{.ext}', { ...values, n: options.counterStart + index * options.counterStep, parent: parentName(entry.path), size: entry.size, mtimeMs: entry.mtimeMs, hash8: entry.hash8 });
    }
    const folder = folderOf(entry.path);
    return { entry, name, newName, folder, to: folder ? `${folder}/${newName}` : newName };
  });
  const renamedAway = new Set(drafts.filter((draft) => draft.newName !== draft.name).map((draft) => draft.entry.path.toLowerCase()));
  const targets = new Map<string, number>();
  for (const draft of drafts) if (draft.newName !== draft.name) targets.set(draft.to.toLowerCase(), (targets.get(draft.to.toLowerCase()) ?? 0) + 1);
  return drafts.map(({ entry, name, newName, folder, to }) => {
    const base = { path: entry.path, kind: entry.kind, name, newName, to };
    if (newName === name) return { ...base, status: 'unchanged' as const };
    const invalid = invalidWindowsName(newName);
    if (invalid) return { ...base, status: 'invalid' as const, reason: invalid };
    if ((targets.get(to.toLowerCase()) ?? 0) > 1) return { ...base, status: 'collision' as const, reason: 'Another item in this folder would get the same name.' };
    const caseOnly = newName.toLowerCase() === name.toLowerCase();
    const taken = existing.get(folder)?.has(newName.toLowerCase()) && !renamedAway.has(to.toLowerCase());
    if (!caseOnly && taken) return { ...base, status: 'exists' as const, reason: 'An item with this name already exists here.' };
    return { ...base, status: 'rename' as const, ...(to.length > 240 ? { warning: 'Long path — may exceed the 260-character limit of older Windows apps.' } : {}) };
  });
}
