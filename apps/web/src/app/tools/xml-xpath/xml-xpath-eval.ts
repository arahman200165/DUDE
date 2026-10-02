/**
 * XPath evaluation against XML using the browser's (or jsdom's) native
 * `Document.evaluate()` — the one place in DUDE that reaches for a native
 * DOM API instead of a library, since browsers already implement XPath 1.0
 * for free. Not run in a Worker: XPath evaluation is fast enough for
 * interactive use, and Worker support for `DOMParser`/`evaluate` is
 * inconsistent across browsers.
 */

export type XPathResultKind = 'nodes' | 'string' | 'number' | 'boolean';

export interface XPathEvalError {
  readonly message: string;
}

export interface XPathEvalSuccess {
  readonly resultType: XPathResultKind;
  readonly matches: readonly string[];
}

export type XPathEvalResult = { readonly ok: true; readonly result: XPathEvalSuccess } | { readonly ok: false; readonly error: XPathEvalError };

export function evaluateXPath(xmlInput: string, expression: string): XPathEvalResult {
  if (xmlInput.trim() === '') return { ok: false, error: { message: 'Enter some XML.' } };
  if (expression.trim() === '') return { ok: false, error: { message: 'Enter an XPath expression.' } };

  const doc = new DOMParser().parseFromString(xmlInput, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) return { ok: false, error: { message: parserError.textContent?.trim() || 'Invalid XML.' } };

  try {
    const evaluation = doc.evaluate(expression, doc, null, XPathResult.ANY_TYPE, null);

    switch (evaluation.resultType) {
      case XPathResult.STRING_TYPE:
        return { ok: true, result: { resultType: 'string', matches: [evaluation.stringValue] } };
      case XPathResult.NUMBER_TYPE:
        return { ok: true, result: { resultType: 'number', matches: [String(evaluation.numberValue)] } };
      case XPathResult.BOOLEAN_TYPE:
        return { ok: true, result: { resultType: 'boolean', matches: [String(evaluation.booleanValue)] } };
      default: {
        const serializer = new XMLSerializer();
        const matches: string[] = [];
        for (let node = evaluation.iterateNext(); node; node = evaluation.iterateNext()) {
          const isLeaf = node.nodeType === Node.ATTRIBUTE_NODE || node.nodeType === Node.TEXT_NODE;
          matches.push(isLeaf ? (node.textContent ?? '') : serializer.serializeToString(node));
        }
        return { ok: true, result: { resultType: 'nodes', matches } };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { message: message || 'Invalid XPath expression.' } };
  }
}
