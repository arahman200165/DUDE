import { TreeNode } from '../../shared/components/tree-view/tree-view';

export type DomTreeResult = { readonly ok: true; readonly nodes: readonly TreeNode[] } | { readonly ok: false; readonly error: string };

function truncate(text: string, max = 60): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function attrSummary(element: Element): string {
  const attrs = Array.from(element.attributes)
    .map((a) => `${a.name}="${a.value}"`)
    .join(' ');
  return attrs === '' ? '' : ` ${attrs}`;
}

function nodeToTreeNode(node: Node, path: string): TreeNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text.trim() === '') return null;
    return { label: '#text', path, valueLabel: truncate(text), type: 'text' };
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return { label: '#comment', path, valueLabel: truncate(node.textContent ?? ''), type: 'comment' };
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const childNodes = Array.from(element.childNodes)
    .map((child, i) => nodeToTreeNode(child, `${path}.${i}`))
    .filter((n): n is TreeNode => n !== null);

  return {
    label: element.tagName.toLowerCase(),
    path,
    valueLabel: attrSummary(element),
    type: 'element',
    children: childNodes.length > 0 ? childNodes : undefined,
  };
}

export function buildDomTree(html: string): DomTreeResult {
  if (html.trim() === '') return { ok: false, error: 'Enter some HTML to view.' };

  // An inert document (no browsing context): a detached element of the live `document` would still
  // fetch `<img src>` and run inline handlers like `onerror` the moment innerHTML parses them.
  const container = document.implementation.createHTMLDocument('').createElement('div');
  container.innerHTML = html;

  const roots = Array.from(container.childNodes)
    .map((child, i) => nodeToTreeNode(child, `${i}`))
    .filter((n): n is TreeNode => n !== null);

  if (roots.length === 0) return { ok: false, error: 'No elements found in this HTML.' };

  return { ok: true, nodes: roots };
}
