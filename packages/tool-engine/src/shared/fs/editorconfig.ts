import picomatch from 'picomatch';
import type { ConvertOptions } from "./text-convert.js";

/**
 * A small, spec-following `.editorconfig` resolver for the Batch Text Converter's editorconfig mode
 * (Phase 29 item 7/8, Milestone 531). Files are read closest-last from the file's folder up to the
 * first `root = true`; later sections win, and a section glob without `/` matches at any depth
 * (https://spec.editorconfig.org). Only the properties the converter can apply are mapped.
 */

export interface EditorConfigFile {
  /** Posix folder of the `.editorconfig`, relative to the walk root ('' for the root). */
  readonly dir: string;
  readonly root: boolean;
  readonly sections: readonly { readonly glob: string; readonly properties: Readonly<Record<string, string>> }[];
}

export function parseEditorConfig(text: string, dir: string): EditorConfigFile {
  const sections: { glob: string; properties: Record<string, string> }[] = [];
  let root = false;
  let current: { glob: string; properties: Record<string, string> } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) { current = { glob: header[1], properties: {} }; sections.push(current); continue; }
    const pair = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim().toLowerCase();
    if (!current) { if (key === 'root') root = value === 'true'; continue; }
    current.properties[key] = value;
  }
  return { dir, root, sections };
}

function sectionMatches(glob: string, relativeToConfig: string): boolean {
  const pattern = glob.includes('/') ? glob.replace(/^\//, '') : `**/${glob}`;
  try { return picomatch.isMatch(relativeToConfig, pattern, { dot: true }); } catch { return false; }
}

/** Effective properties for `path` (posix, root-relative), given every `.editorconfig` in the tree. */
export function resolveEditorConfig(path: string, files: ReadonlyMap<string, EditorConfigFile>): Record<string, string> {
  const folders: string[] = [];
  let folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  for (;;) {
    folders.push(folder);
    if (!folder) break;
    folder = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '';
  }
  const chain: EditorConfigFile[] = [];
  for (const dir of folders) {
    const file = files.get(dir);
    if (!file) continue;
    chain.unshift(file);
    if (file.root) break;
  }
  const properties: Record<string, string> = {};
  for (const file of chain) {
    const relative = file.dir ? path.slice(file.dir.length + 1) : path;
    for (const section of file.sections) if (sectionMatches(section.glob, relative)) Object.assign(properties, section.properties);
  }
  return properties;
}

const CHARSETS: Readonly<Record<string, { encoding: string; bom: 'add' | 'strip' }>> = {
  latin1: { encoding: 'latin1', bom: 'strip' },
  'utf-8': { encoding: 'utf8', bom: 'strip' },
  'utf-8-bom': { encoding: 'utf8', bom: 'add' },
  'utf-16be': { encoding: 'utf16be', bom: 'add' },
  'utf-16le': { encoding: 'utf16le', bom: 'add' },
};

/** Maps editorconfig properties onto converter options; unset properties stay 'keep'. */
export function editorConfigToOptions(properties: Readonly<Record<string, string>>): ConvertOptions {
  const eol = properties['end_of_line'];
  const charset = CHARSETS[properties['charset'] ?? ''];
  const size = Number(properties['indent_size'] === 'tab' ? properties['tab_width'] : properties['indent_size'] ?? properties['tab_width']);
  return {
    eol: eol === 'lf' || eol === 'crlf' || eol === 'cr' ? eol : 'keep',
    encoding: charset?.encoding ?? 'keep',
    bom: charset?.bom ?? 'keep',
    finalNewline: properties['insert_final_newline'] === 'true' ? 'ensure' : properties['insert_final_newline'] === 'false' ? 'strip' : 'keep',
    trimTrailing: properties['trim_trailing_whitespace'] === 'true',
    indent: properties['indent_style'] === 'tab' ? 'tabs' : properties['indent_style'] === 'space' ? 'spaces' : 'keep',
    indentSize: Number.isFinite(size) && size > 0 ? size : 4,
    editorconfig: true,
  };
}
