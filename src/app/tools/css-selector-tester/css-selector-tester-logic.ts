export interface SelectorTestAttribute {
  readonly name: string;
  readonly value: string;
}

export interface SelectorTestElement {
  readonly tag: string;
  readonly id: string | null;
  readonly classes: readonly string[];
  readonly attributes: readonly SelectorTestAttribute[];
  readonly depth: number;
  readonly matched: boolean;
}

export type SelectorTestResult =
  | { readonly ok: true; readonly elements: readonly SelectorTestElement[]; readonly matchCount: number }
  | { readonly ok: false; readonly error: string };

/**
 * Parses `html` into a `<div>` of an inert document (the browser's own parser,
 * but no browsing context, so nothing loads and no inline handler runs),
 * runs `selector` against it with `querySelectorAll`, and returns every
 * element in document order flagged with whether it matched. Deliberately
 * returns a structural summary rather than raw HTML to render — nothing here
 * ever gets injected back into the live DOM.
 */
export function testSelector(html: string, selector: string): SelectorTestResult {
  const trimmedSelector = selector.trim();
  if (trimmedSelector === '') return { ok: false, error: 'Enter a CSS selector.' };

  // An inert document (no browsing context): a detached element of the live `document` would still
  // fetch `<img src>` and run inline handlers like `onerror` the moment innerHTML parses them.
  const container = document.implementation.createHTMLDocument('').createElement('div');
  container.innerHTML = html;

  let matched: NodeListOf<Element>;
  try {
    matched = container.querySelectorAll(trimmedSelector);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid selector syntax.' };
  }
  const matchedSet = new Set(Array.from(matched));

  const elements: SelectorTestElement[] = [];
  const walk = (node: Element, depth: number): void => {
    elements.push({
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: Array.from(node.classList),
      attributes: Array.from(node.attributes)
        .filter((a) => a.name !== 'id' && a.name !== 'class')
        .map((a) => ({ name: a.name, value: a.value })),
      depth,
      matched: matchedSet.has(node),
    });
    for (const child of Array.from(node.children)) walk(child, depth + 1);
  };
  for (const child of Array.from(container.children)) walk(child, 0);

  return { ok: true, elements, matchCount: matchedSet.size };
}
