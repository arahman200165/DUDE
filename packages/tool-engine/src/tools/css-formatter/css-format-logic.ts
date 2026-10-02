export type CssFormatMode = 'pretty' | 'minify';

export type CssFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

interface MaskedToken {
  readonly placeholder: string;
  readonly value: string;
  readonly kind: 'string' | 'comment';
}

interface MaskResult {
  readonly masked: string;
  readonly tokens: readonly MaskedToken[];
  readonly error?: string;
}

/**
 * Real CSS can have `{`, `}`, `;`, and `:` inside a quoted string or a
 * comment, which a naive line/regex-based formatter would misinterpret as
 * structural. This first pass replaces every string literal and comment
 * with a NUL-delimited placeholder (NUL never appears in real CSS text, so
 * it can't collide) before any structural tokenizing happens, then restores
 * the real text at the very end. Structural tokenizing therefore only ever
 * sees code it's safe to reason about.
 */
function maskStringsAndComments(input: string): MaskResult {
  const tokens: MaskedToken[] = [];
  let masked = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) return { masked, tokens, error: 'Unterminated comment (missing closing */).' };
      const value = input.slice(i, end + 2);
      const placeholder = `\u0000C${tokens.length}\u0000`;
      tokens.push({ placeholder, value, kind: 'comment' });
      masked += placeholder;
      i = end + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let terminated = false;
      while (j < input.length) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input[j] === quote) {
          j++;
          terminated = true;
          break;
        }
        j++;
      }
      if (!terminated) return { masked, tokens, error: `Unterminated string starting at character ${i}.` };
      const value = input.slice(i, j);
      const placeholder = `\u0000S${tokens.length}\u0000`;
      tokens.push({ placeholder, value, kind: 'string' });
      masked += placeholder;
      i = j;
      continue;
    }

    masked += ch;
    i++;
  }

  return { masked, tokens };
}

/**
 * Minify mode needs comments gone *before* structural tokenizing, not just
 * blanked out at the end — a comment sitting between two declarations with
 * no `;`/`{`/`}` around it (e.g. `color: red; /* c *\/ background: blue;`)
 * gets absorbed into the same chunk as the following declaration, and
 * removing it only after formatting would leave the whitespace that used to
 * surround it stranded (`; background` instead of `;background`). Stripping
 * it pre-tokenization lets `collapseWhitespace` fold that gap away naturally.
 */
function stripCommentPlaceholders(masked: string, tokens: readonly MaskedToken[]): string {
  let result = masked;
  for (const token of tokens) {
    if (token.kind === 'comment') result = result.replace(token.placeholder, '');
  }
  return result;
}

function restore(text: string, tokens: readonly MaskedToken[], stripComments: boolean): string {
  let result = text;
  for (const token of tokens) {
    result = result.replace(token.placeholder, token.kind === 'comment' && stripComments ? '' : token.value);
  }
  return result;
}

type StructuralToken = { readonly type: 'chunk'; readonly value: string } | { readonly type: 'open' | 'close' | 'semi' };

function tokenizeStructure(masked: string): StructuralToken[] {
  const tokens: StructuralToken[] = [];
  let buf = '';
  for (const ch of masked) {
    if (ch === '{' || ch === '}' || ch === ';') {
      if (buf.trim() !== '') tokens.push({ type: 'chunk', value: buf.trim() });
      buf = '';
      tokens.push({ type: ch === '{' ? 'open' : ch === '}' ? 'close' : 'semi' });
    } else {
      buf += ch;
    }
  }
  if (buf.trim() !== '') tokens.push({ type: 'chunk', value: buf.trim() });
  return tokens;
}

/** Splits on top-level commas only — not commas nested inside `(...)`, e.g. `:not(a, b)`. */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== '') parts.push(buf.trim());
  return parts;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function formatPretty(tokens: readonly StructuralToken[]): CssFormatResult {
  const lines: string[] = [];
  let depth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'close') {
      depth--;
      if (depth < 0) return { ok: false, error: 'Unmatched closing brace — more `}` than `{`.' };
      lines.push(`${'  '.repeat(depth)}}`);
      continue;
    }

    if (token.type === 'chunk') {
      const next = tokens[i + 1];
      const indent = '  '.repeat(depth);

      if (next?.type === 'open') {
        // A rule/at-rule header (selector list or `@media (...)` prelude) — one selector per line.
        const selectors = splitTopLevelCommas(collapseWhitespace(token.value));
        selectors.forEach((sel, idx) => {
          const suffix = idx === selectors.length - 1 ? ' {' : ',';
          lines.push(`${indent}${sel}${suffix}`);
        });
      } else {
        // A declaration (`prop: value`) or a bare at-rule statement with no block (`@import url(...)`).
        const colonIndex = token.value.indexOf(':');
        const isDeclaration = colonIndex > -1 && !token.value.trimStart().startsWith('@');
        const formatted = isDeclaration
          ? `${collapseWhitespace(token.value.slice(0, colonIndex))}: ${collapseWhitespace(token.value.slice(colonIndex + 1))}`
          : collapseWhitespace(token.value);
        const suffix = next?.type === 'semi' ? ';' : next?.type === 'close' || next === undefined ? ';' : '';
        lines.push(`${indent}${formatted}${suffix}`);
      }
      continue;
    }

    if (token.type === 'open') {
      depth++;
      continue;
    }
    // 'semi' with no preceding chunk (stray `;`) — nothing to emit.
  }

  if (depth !== 0) return { ok: false, error: `Unmatched opening brace — ${depth} block${depth === 1 ? '' : 's'} never closed.` };
  return { ok: true, output: lines.join('\n') };
}

function formatMinify(tokens: readonly StructuralToken[]): CssFormatResult {
  let output = '';
  let depth = 0;
  let pendingSemi = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'open') {
      depth++;
      output += '{';
      pendingSemi = false;
      continue;
    }
    if (token.type === 'close') {
      depth--;
      if (depth < 0) return { ok: false, error: 'Unmatched closing brace — more `}` than `{`.' };
      output += '}';
      pendingSemi = false;
      continue;
    }
    if (token.type === 'semi') {
      pendingSemi = true;
      continue;
    }
    if (token.type !== 'chunk') continue;

    if (pendingSemi) output += ';';
    const next = tokens[i + 1];
    if (next?.type === 'open') {
      output += splitTopLevelCommas(collapseWhitespace(token.value)).join(',') + '{';
      i++; // the 'open' token was consumed here to avoid double-adding '{'.
      depth++;
      pendingSemi = false;
      continue;
    }
    const colonIndex = token.value.indexOf(':');
    const isDeclaration = colonIndex > -1 && !token.value.trimStart().startsWith('@');
    const formatted = isDeclaration
      ? `${collapseWhitespace(token.value.slice(0, colonIndex))}:${collapseWhitespace(token.value.slice(colonIndex + 1))}`
      : collapseWhitespace(token.value);
    output += formatted;
    pendingSemi = false;
  }

  if (depth !== 0) return { ok: false, error: `Unmatched opening brace — ${depth} block${depth === 1 ? '' : 's'} never closed.` };
  return { ok: true, output };
}

export function formatCss(input: string, mode: CssFormatMode): CssFormatResult {
  if (input.trim() === '') return { ok: false, error: 'Enter some CSS to format.' };

  const mask = maskStringsAndComments(input);
  if (mask.error) return { ok: false, error: mask.error };

  const working = mode === 'minify' ? stripCommentPlaceholders(mask.masked, mask.tokens) : mask.masked;
  const tokens = tokenizeStructure(working);
  const result = mode === 'pretty' ? formatPretty(tokens) : formatMinify(tokens);
  if (!result.ok) return result;

  return { ok: true, output: restore(result.output, mask.tokens, mode === 'minify') };
}
