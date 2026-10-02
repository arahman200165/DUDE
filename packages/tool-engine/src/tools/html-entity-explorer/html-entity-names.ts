/**
 * A curated set of the HTML named character references people actually
 * look up -- not the full ~2100-entry HTML5 named-entity list. Character
 * codepoints are never transcribed by hand here; `html-entity-explorer-logic.ts`
 * resolves each name to its real character via the browser's own HTML
 * parser (same detached-`<textarea>` decode `html-entity-codec.ts` uses),
 * the same "delegate to the browser, don't hand-roll a table" convention.
 */
export const HTML_ENTITY_NAMES: readonly string[] = [
  // Reserved / markup-significant
  'quot', 'amp', 'apos', 'lt', 'gt',
  // Latin-1 supplement
  'nbsp', 'iexcl', 'cent', 'pound', 'curren', 'yen', 'brvbar', 'sect', 'uml', 'copy',
  'ordf', 'laquo', 'not', 'shy', 'reg', 'macr', 'deg', 'plusmn', 'sup2', 'sup3',
  'acute', 'micro', 'para', 'middot', 'cedil', 'sup1', 'ordm', 'raquo', 'frac14', 'frac12',
  'frac34', 'iquest', 'times', 'divide',
  'Agrave', 'Aacute', 'Acirc', 'Atilde', 'Auml', 'Aring', 'AElig', 'Ccedil',
  'Egrave', 'Eacute', 'Ecirc', 'Euml', 'Igrave', 'Iacute', 'Icirc', 'Iuml',
  'ETH', 'Ntilde', 'Ograve', 'Oacute', 'Ocirc', 'Otilde', 'Ouml', 'Oslash',
  'Ugrave', 'Uacute', 'Ucirc', 'Uuml', 'Yacute', 'THORN', 'szlig',
  'agrave', 'aacute', 'acirc', 'atilde', 'auml', 'aring', 'aelig', 'ccedil',
  'egrave', 'eacute', 'ecirc', 'euml', 'igrave', 'iacute', 'icirc', 'iuml',
  'eth', 'ntilde', 'ograve', 'oacute', 'ocirc', 'otilde', 'ouml', 'oslash',
  'ugrave', 'uacute', 'ucirc', 'uuml', 'yacute', 'thorn', 'yuml',
  // General punctuation / symbols
  'trade', 'euro', 'dagger', 'Dagger', 'hellip', 'permil', 'lsquo', 'rsquo',
  'sbquo', 'ldquo', 'rdquo', 'bdquo', 'bull', 'ndash', 'mdash', 'lsaquo', 'rsaquo', 'oline',
  // Arrows
  'larr', 'uarr', 'rarr', 'darr', 'harr', 'crarr', 'lArr', 'uArr', 'rArr', 'dArr', 'hArr',
  // Mathematical operators
  'forall', 'part', 'exist', 'empty', 'nabla', 'isin', 'notin', 'ni', 'prod', 'sum',
  'minus', 'lowast', 'radic', 'prop', 'infin', 'ang', 'and', 'or', 'cap', 'cup',
  'int', 'there4', 'sim', 'cong', 'asymp', 'ne', 'equiv', 'le', 'ge', 'sub', 'sup',
  'nsub', 'sube', 'supe', 'oplus', 'otimes', 'perp', 'sdot',
  // Greek letters
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon',
  'Phi', 'Chi', 'Psi', 'Omega',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigmaf', 'sigma', 'tau', 'upsilon',
  'phi', 'chi', 'psi', 'omega',
];
