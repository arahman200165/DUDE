export type HtmlFormatMode = 'pretty' | 'minify';

export type HtmlFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** "Raw text" elements per the HTML spec -- their content is never entity-escaped and whitespace is significant. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
const WHITESPACE_SIGNIFICANT_ELEMENTS = new Set(['pre', 'textarea']);

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function serializeAttrs(element: Element): string {
  return Array.from(element.attributes)
    .map((attr) => ` ${attr.name}="${escapeAttr(attr.value)}"`)
    .join('');
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function isWhitespaceOnly(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() === '';
}

function serializePretty(node: Node, depth: number, ancestorPreservesWhitespace: boolean): string {
  const indent = '  '.repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    if (ancestorPreservesWhitespace) return raw;
    const trimmed = raw.trim();
    return trimmed === '' ? '' : `${indent}${escapeText(collapseWhitespace(trimmed))}\n`;
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return `${indent}<!--${node.textContent ?? ''}-->\n`;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const attrs = serializeAttrs(element);

  if (VOID_ELEMENTS.has(tag)) return `${indent}<${tag}${attrs}>\n`;

  if (RAW_TEXT_ELEMENTS.has(tag)) {
    const content = element.textContent ?? '';
    return content.trim() === '' ? `${indent}<${tag}${attrs}></${tag}>\n` : `${indent}<${tag}${attrs}>\n${content}\n${indent}</${tag}>\n`;
  }

  const preserves = ancestorPreservesWhitespace || WHITESPACE_SIGNIFICANT_ELEMENTS.has(tag);
  const children = Array.from(element.childNodes).filter((child) => preserves || !isWhitespaceOnly(child));

  if (children.length === 0) return `${indent}<${tag}${attrs}></${tag}>\n`;

  // A single text-only child stays inline: <p>Hello</p> instead of 3 lines.
  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE && !preserves) {
    const text = escapeText(collapseWhitespace((children[0].textContent ?? '').trim()));
    return `${indent}<${tag}${attrs}>${text}</${tag}>\n`;
  }

  if (preserves) {
    const inner = Array.from(element.childNodes)
      .map((child) => (child.nodeType === Node.TEXT_NODE ? (child.textContent ?? '') : serializePretty(child, 0, true).replace(/\n$/, '')))
      .join('');
    return `${indent}<${tag}${attrs}>${inner}</${tag}>\n`;
  }

  const inner = children.map((child) => serializePretty(child, depth + 1, preserves)).join('');
  return `${indent}<${tag}${attrs}>\n${inner}${indent}</${tag}>\n`;
}

function serializeMinified(node: Node, ancestorPreservesWhitespace: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    if (ancestorPreservesWhitespace) return raw;
    if (raw.trim() === '') return '';
    return escapeText(collapseWhitespace(raw).trim());
  }

  if (node.nodeType === Node.COMMENT_NODE) return '';

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const attrs = serializeAttrs(element);

  if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrs}>`;
  if (RAW_TEXT_ELEMENTS.has(tag)) return `<${tag}${attrs}>${element.textContent ?? ''}</${tag}>`;

  const preserves = ancestorPreservesWhitespace || WHITESPACE_SIGNIFICANT_ELEMENTS.has(tag);
  const inner = Array.from(element.childNodes)
    .map((child) => serializeMinified(child, preserves))
    .join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

export function formatHtml(input: string, mode: HtmlFormatMode): HtmlFormatResult {
  if (input.trim() === '') return { ok: false, error: 'Enter some HTML to format.' };

  // An inert document (no browsing context): a detached element of the live `document` would still
  // fetch `<img src>` and run inline handlers like `onerror` the moment innerHTML parses them.
  const container = document.implementation.createHTMLDocument('').createElement('div');
  container.innerHTML = input;

  const roots = Array.from(container.childNodes);
  const output =
    mode === 'pretty'
      ? roots.map((node) => serializePretty(node, 0, false)).join('').trimEnd()
      : roots.map((node) => serializeMinified(node, false)).join('');

  return { ok: true, output };
}
