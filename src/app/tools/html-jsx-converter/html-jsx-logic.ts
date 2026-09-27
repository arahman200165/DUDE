const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** HTML attribute -> JSX prop name, for the attributes whose casing actually differs. Anything not listed here (id, src, href, data-*, aria-*, ...) passes through unchanged. */
const ATTR_RENAME: Readonly<Record<string, string>> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  usemap: 'useMap',
  frameborder: 'frameBorder',
  contenteditable: 'contentEditable',
  crossorigin: 'crossOrigin',
  datetime: 'dateTime',
  enctype: 'encType',
  spellcheck: 'spellCheck',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  autoplay: 'autoPlay',
  novalidate: 'noValidate',
  allowfullscreen: 'allowFullScreen',
  srcset: 'srcSet',
  accesskey: 'accessKey',
  charset: 'charSet',
};

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** React preserves data- and aria- attributes verbatim; every other kebab-case DOM attribute becomes camelCase. */
function jsxAttrName(name: string): string {
  if (name in ATTR_RENAME) return ATTR_RENAME[name];
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  return name.includes('-') ? kebabToCamel(name) : name;
}

function cssPropToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** `"color: red; font-size: 14px"` -> `{{ color: 'red', fontSize: '14px' }}` */
function styleAttrToJsxObject(value: string): string {
  const entries = value
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl !== '')
    .map((decl) => {
      const [prop, ...rest] = decl.split(':');
      const propName = cssPropToCamel(prop.trim());
      const propValue = rest.join(':').trim().replace(/'/g, "\\'");
      return `${propName}: '${propValue}'`;
    });
  return `{{ ${entries.join(', ')} }}`;
}

/** Text nodes may legitimately contain a literal `{`/`}` (e.g. from a decoded `&#123;` entity) which JSX would otherwise parse as an expression start. Raw `<`/`>` in text is a known, rarer limitation not handled here. */
function escapeJsxText(text: string): string {
  return text.replace(/\{/g, "{'{'}").replace(/\}/g, "{'}'}");
}

function serializeAttrsJsx(element: Element): string {
  return Array.from(element.attributes)
    .map((attr) => {
      const name = jsxAttrName(attr.name);
      if (attr.name === 'style') return ` style=${styleAttrToJsxObject(attr.value)}`;
      return ` ${name}="${attr.value.replace(/"/g, '&quot;')}"`;
    })
    .join('');
}

function nodeToJsx(node: Node, depth: number): string {
  const indent = '  '.repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? '';
    const trimmed = raw.trim();
    return trimmed === '' ? '' : `${indent}${escapeJsxText(trimmed)}\n`;
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return `${indent}{/*${node.textContent ?? ''}*/}\n`;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const attrs = serializeAttrsJsx(element);

  if (VOID_ELEMENTS.has(tag)) return `${indent}<${tag}${attrs} />\n`;

  const children = Array.from(element.childNodes).filter((c) => !(c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim() === ''));
  if (children.length === 0) return `${indent}<${tag}${attrs}></${tag}>\n`;

  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    return `${indent}<${tag}${attrs}>${escapeJsxText((children[0].textContent ?? '').trim())}</${tag}>\n`;
  }

  const inner = children.map((child) => nodeToJsx(child, depth + 1)).join('');
  return `${indent}<${tag}${attrs}>\n${inner}${indent}</${tag}>\n`;
}

export type HtmlJsxResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function htmlToJsx(html: string): HtmlJsxResult {
  if (html.trim() === '') return { ok: false, error: 'Enter some HTML to convert.' };

  // An inert document (no browsing context): a detached element of the live `document` would still
  // fetch `<img src>` and run inline handlers like `onerror` the moment innerHTML parses them.
  const container = document.implementation.createHTMLDocument('').createElement('div');
  container.innerHTML = html;
  const roots = Array.from(container.childNodes);
  const output = roots.map((node) => nodeToJsx(node, 0)).join('').trimEnd();

  return output === '' ? { ok: false, error: 'No elements found in this HTML.' } : { ok: true, output };
}

const REVERSE_ATTR_RENAME: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(ATTR_RENAME).map(([html, jsx]) => [jsx, html]));

/**
 * Best-effort reverse of the common cases htmlToJsx produces -- a regex
 * substitution pass, not a real JSX/JS parser. It handles simple, static
 * JSX markup (renamed attributes, a style object, {/* *\/} comments,
 * self-closing void tags) but will not correctly handle expressions,
 * event handlers, conditional rendering, or embedded JS -- those have no
 * HTML equivalent at all. This is a deliberate scope cut: a real JSX
 * parser is a much bigger dependency than this tool's value justifies.
 */
export function jsxToHtml(jsx: string): HtmlJsxResult {
  if (jsx.trim() === '') return { ok: false, error: 'Enter some JSX to convert.' };

  let output = jsx;

  output = output.replace(/\{\/\*([\s\S]*?)\*\/\}/g, (_, comment: string) => `<!--${comment}-->`);
  output = output.replace(/\{'([{}])'\}/g, (_, char: string) => char);

  output = output.replace(/style=\{\{([\s\S]*?)\}\}/g, (_, body: string) => {
    const decls = body
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
      .map((entry) => {
        const [prop, ...rest] = entry.split(':');
        const cssProp = prop.trim().replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
        const cssValue = rest.join(':').trim().replace(/^['"]|['"]$/g, '');
        return `${cssProp}: ${cssValue}`;
      });
    return `style="${decls.join('; ')}"`;
  });

  for (const [jsxName, htmlName] of Object.entries(REVERSE_ATTR_RENAME)) {
    output = output.replace(new RegExp(`\\b${jsxName}=`, 'g'), `${htmlName}=`);
  }

  output = output.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^/>]*)?)\s*\/>/g, (match, tag: string, attrs: string) =>
    VOID_ELEMENTS.has(tag.toLowerCase()) ? `<${tag}${attrs.trimEnd()}>` : match,
  );

  return { ok: true, output: output.trim() };
}
