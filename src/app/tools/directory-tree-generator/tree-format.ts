import type { WalkEntry } from '../../../shared-logic/fs/fs-types';
import { formatBytes } from '../../../shared-logic/fs/format-size';

/**
 * Pure tree building and rendering for the Directory Tree Generator (Phase 29 item 4): `tree`-style
 * Unicode/ASCII, nested Markdown, JSON, collapsible HTML, Mermaid mindmap, and PlantUML mindmap.
 */

export type TreeFormat = 'unicode' | 'ascii' | 'markdown' | 'json' | 'html' | 'mermaid' | 'plantuml';
export type TreeSort = 'name' | 'dirs-first' | 'size';

export interface TreeNode {
  readonly name: string;
  readonly kind: 'file' | 'dir' | 'link';
  size: number;
  readonly linkTarget?: string;
  readonly children: TreeNode[];
}

export interface TreeRenderOptions {
  readonly format: TreeFormat;
  readonly sort: TreeSort;
  readonly dirsOnly: boolean;
  readonly showSizes: boolean;
  readonly rootName: string;
  readonly trailingSlash: boolean;
}

export const DEFAULT_TREE_OPTIONS: TreeRenderOptions = { format: 'unicode', sort: 'dirs-first', dirsOnly: false, showSizes: false, rootName: '.', trailingSlash: true };

/** Builds a nested tree from walk entries (any order); directory sizes are summed from their files. */
export function buildTree(entries: readonly WalkEntry[], rootName: string): TreeNode {
  const root: TreeNode = { name: rootName, kind: 'dir', size: 0, children: [] };
  const dirs = new Map<string, TreeNode>([['', root]]);
  const ensureDir = (path: string): TreeNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    const parent = ensureDir(slash < 0 ? '' : path.slice(0, slash));
    const node: TreeNode = { name: path.slice(slash + 1), kind: 'dir', size: 0, children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const entry of entries) {
    if (entry.kind === 'dir') { ensureDir(entry.path); continue; }
    const slash = entry.path.lastIndexOf('/');
    const parent = ensureDir(slash < 0 ? '' : entry.path.slice(0, slash));
    parent.children.push({ name: entry.path.slice(slash + 1), kind: entry.kind, size: entry.size, ...(entry.linkTarget ? { linkTarget: entry.linkTarget } : {}), children: [] });
  }
  const total = (node: TreeNode): number => {
    if (node.kind !== 'dir') return node.size;
    node.size = node.children.reduce((sum, child) => sum + total(child), 0);
    return node.size;
  };
  total(root);
  return root;
}

function prepared(node: TreeNode, options: TreeRenderOptions): TreeNode[] {
  const children = options.dirsOnly ? node.children.filter((child) => child.kind === 'dir') : [...node.children];
  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  if (options.sort === 'size') return children.sort((a, b) => b.size - a.size || byName(a, b));
  if (options.sort === 'dirs-first') return children.sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || byName(a, b));
  return children.sort(byName);
}

function label(node: TreeNode, options: TreeRenderOptions): string {
  let text = node.name;
  if (node.kind === 'dir' && options.trailingSlash) text += '/';
  if (node.kind === 'link') text += ` -> ${node.linkTarget ?? '?'}`;
  if (options.showSizes) text += ` (${formatBytes(node.size)})`;
  return text;
}

export function countTree(node: TreeNode, options: Pick<TreeRenderOptions, 'dirsOnly'>): { dirs: number; files: number } {
  let dirs = 0;
  let files = 0;
  const visit = (current: TreeNode) => {
    for (const child of current.children) {
      if (child.kind === 'dir') { dirs++; visit(child); } else if (!options.dirsOnly) files++;
    }
  };
  visit(node);
  return { dirs, files };
}

function lines(node: TreeNode, options: TreeRenderOptions, ascii: boolean): string[] {
  const [tee, last, pipe, blank] = ascii ? ['|-- ', '`-- ', '|   ', '    '] : ['├── ', '└── ', '│   ', '    '];
  const out = [label({ ...node, name: options.rootName }, { ...options, trailingSlash: false })];
  const visit = (current: TreeNode, prefix: string) => {
    const children = prepared(current, options);
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      out.push(prefix + (isLast ? last : tee) + label(child, options));
      if (child.kind === 'dir') visit(child, prefix + (isLast ? blank : pipe));
    });
  };
  visit(node, '');
  const count = countTree(node, options);
  out.push('', options.dirsOnly ? `${count.dirs} directories` : `${count.dirs} directories, ${count.files} files`);
  return out;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function markdown(node: TreeNode, options: TreeRenderOptions): string[] {
  const out = [`- **${options.rootName}**`];
  const visit = (current: TreeNode, depth: number) => {
    for (const child of prepared(current, options)) {
      out.push(`${'  '.repeat(depth)}- ${child.kind === 'dir' ? `**${label(child, options).replace(/[*_`]/g, '\\$&')}**` : `\`${label(child, options).replace(/`/g, "'")}\``}`);
      if (child.kind === 'dir') visit(child, depth + 1);
    }
  };
  visit(node, 1);
  return out;
}

interface JsonNode { name: string; type: 'directory' | 'file' | 'link'; size?: number; target?: string; children?: JsonNode[] }
function toJson(node: TreeNode, options: TreeRenderOptions, name = node.name): JsonNode {
  const type = node.kind === 'dir' ? 'directory' : node.kind;
  return {
    name,
    type,
    ...(options.showSizes ? { size: node.size } : {}),
    ...(node.linkTarget ? { target: node.linkTarget } : {}),
    ...(node.kind === 'dir' ? { children: prepared(node, options).map((child) => toJson(child, options)) } : {}),
  };
}

function html(node: TreeNode, options: TreeRenderOptions): string {
  const render = (current: TreeNode, name: string, isRoot: boolean): string => {
    if (current.kind !== 'dir') return `<li>${escapeHtml(label({ ...current, name }, options))}</li>`;
    const children = prepared(current, options).map((child) => render(child, child.name, false)).join('');
    const text = label({ ...current, name }, isRoot ? { ...options, trailingSlash: false } : options);
    return `<li><details${isRoot ? ' open' : ''}><summary>${escapeHtml(text)}</summary><ul>${children}</ul></details></li>`;
  };
  return `<ul class="dude-tree">${render(node, options.rootName, true)}</ul>`;
}

/** Mermaid mindmap node text can't contain its own shape delimiters; quote with the string form. */
function mermaidText(value: string): string { return `["${value.replace(/"/g, "'")}"]`; }

function mermaid(node: TreeNode, options: TreeRenderOptions): string[] {
  const out = ['mindmap', `  root${mermaidText(options.rootName)}`];
  const visit = (current: TreeNode, depth: number) => {
    for (const child of prepared(current, options)) {
      out.push(`${'  '.repeat(depth + 1)}${mermaidText(label(child, options))}`);
      if (child.kind === 'dir') visit(child, depth + 1);
    }
  };
  visit(node, 1);
  return out;
}

function plantuml(node: TreeNode, options: TreeRenderOptions): string[] {
  const out = ['@startmindmap', `* ${options.rootName}`];
  const visit = (current: TreeNode, depth: number) => {
    for (const child of prepared(current, options)) {
      out.push(`${'*'.repeat(depth + 1)}${child.kind === 'dir' ? '' : '_'} ${label(child, options)}`);
      if (child.kind === 'dir') visit(child, depth + 1);
    }
  };
  visit(node, 1);
  out.push('@endmindmap');
  return out;
}

export function renderTree(node: TreeNode, options: TreeRenderOptions): string {
  switch (options.format) {
    case 'unicode': return lines(node, options, false).join('\n') + '\n';
    case 'ascii': return lines(node, options, true).join('\n') + '\n';
    case 'markdown': return markdown(node, options).join('\n') + '\n';
    case 'json': return JSON.stringify(toJson(node, options, options.rootName), null, 2) + '\n';
    case 'html': return html(node, options) + '\n';
    case 'mermaid': return mermaid(node, options).join('\n') + '\n';
    case 'plantuml': return plantuml(node, options).join('\n') + '\n';
  }
}

export const FORMAT_EXTENSIONS: Readonly<Record<TreeFormat, string>> = {
  unicode: '.txt', ascii: '.txt', markdown: '.md', json: '.json', html: '.html', mermaid: '.mmd', plantuml: '.puml',
};
