import { HTML_ENTITY_NAMES } from "@dude/tool-engine/tools/html-entity-explorer/html-entity-names";

export interface HtmlEntityEntry {
  readonly name: string;
  readonly char: string;
  readonly decimal: number;
  readonly hex: string;
}

/** Delegates decoding to the browser's own HTML parser via a detached `<textarea>` -- same convention `html-entity-codec.ts` uses -- so codepoints are never hand-transcribed. */
function resolveEntity(name: string): HtmlEntityEntry | null {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = `&${name};`;
  const char = textarea.value;
  if (char === `&${name};` || char.length === 0) return null;

  const codePoint = char.codePointAt(0) ?? 0;
  return { name, char, decimal: codePoint, hex: codePoint.toString(16).toUpperCase() };
}

export const HTML_ENTITY_TABLE: readonly HtmlEntityEntry[] = HTML_ENTITY_NAMES.map(resolveEntity).filter(
  (entry): entry is HtmlEntityEntry => entry !== null,
);

export function filterEntityTable(table: readonly HtmlEntityEntry[], query: string): readonly HtmlEntityEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return table;

  return table.filter(
    (entry) =>
      entry.name.toLowerCase().includes(trimmed) ||
      entry.char === query ||
      entry.decimal.toString() === trimmed ||
      entry.hex.toLowerCase() === trimmed.replace(/^0x/, ''),
  );
}
