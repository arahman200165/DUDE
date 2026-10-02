/**
 * Pure, framework-free .resx (.NET resource XML) parsing, building, diffing,
 * merging, and .NET-style `{0}` format-token extraction, used by the Resx
 * tool. Only `<data name="..."><value>...</value>[<comment>...</comment>]
 * </data>` entries are read/written — the large `<resheader>`/schema
 * boilerplate real .resx files carry is ignored on read and omitted on
 * write, since it's fixed schema noise, not user data.
 */

import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

export interface ResxEntry {
  readonly name: string;
  readonly value: string;
  readonly comment?: string;
}

export interface ResxError {
  readonly message: string;
}

export type ResxParseResult = { readonly ok: true; readonly entries: readonly ResxEntry[] } | { readonly ok: false; readonly error: ResxError };

const PARSER_OPTIONS = { ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name: string) => name === 'data' } as const;

export function parseResx(input: string): ResxParseResult {
  if (input.trim() === '') return { ok: false, error: { message: 'Enter some .resx XML.' } };

  const validation = XMLValidator.validate(input);
  if (validation !== true) return { ok: false, error: { message: validation.err.msg } };

  try {
    const parsed = new XMLParser(PARSER_OPTIONS).parse(input) as Record<string, unknown>;
    const root = parsed['root'] as Record<string, unknown> | undefined;
    if (!root) return { ok: false, error: { message: 'Missing <root> element.' } };

    const rawEntries = (root['data'] as readonly Record<string, unknown>[] | undefined) ?? [];
    const entries = rawEntries.map((entry) => ({
      name: String(entry['@_name'] ?? ''),
      value: entry['value'] !== undefined ? String(entry['value']) : '',
      comment: entry['comment'] !== undefined ? String(entry['comment']) : undefined,
    }));

    return { ok: true, entries };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export function buildResx(entries: readonly ResxEntry[]): string {
  const data = entries.map((entry) => ({
    '@_name': entry.name,
    '@_xml:space': 'preserve',
    value: entry.value,
    ...(entry.comment !== undefined ? { comment: entry.comment } : {}),
  }));

  const builder = new XMLBuilder({ ...PARSER_OPTIONS, format: true, indentBy: '  ' });
  const body = (builder.build({ root: { data } }) as string).trim();
  return `<?xml version="1.0" encoding="utf-8"?>\n${body}\n`;
}

export type ResxDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ResxDiffEntry {
  readonly name: string;
  readonly status: ResxDiffStatus;
  readonly baseValue?: string;
  readonly overlayValue?: string;
}

export function diffResx(baseEntries: readonly ResxEntry[], overlayEntries: readonly ResxEntry[]): readonly ResxDiffEntry[] {
  const baseByName = new Map(baseEntries.map((entry) => [entry.name, entry]));
  const overlayByName = new Map(overlayEntries.map((entry) => [entry.name, entry]));
  const names = [...new Set([...baseByName.keys(), ...overlayByName.keys()])].sort();

  return names.map((name) => {
    const base = baseByName.get(name);
    const overlay = overlayByName.get(name);
    if (!base) return { name, status: 'added', overlayValue: overlay!.value };
    if (!overlay) return { name, status: 'removed', baseValue: base.value };
    if (base.value !== overlay.value) return { name, status: 'changed', baseValue: base.value, overlayValue: overlay.value };
    return { name, status: 'unchanged', baseValue: base.value, overlayValue: overlay.value };
  });
}

/** Overlay entries win on a matching name; base order is preserved, with overlay-only entries appended. */
export function mergeResx(baseEntries: readonly ResxEntry[], overlayEntries: readonly ResxEntry[]): readonly ResxEntry[] {
  const overlayByName = new Map(overlayEntries.map((entry) => [entry.name, entry]));
  const merged = baseEntries.map((entry) => overlayByName.get(entry.name) ?? entry);

  const baseNames = new Set(baseEntries.map((entry) => entry.name));
  const additions = overlayEntries.filter((entry) => !baseNames.has(entry.name));
  return [...merged, ...additions];
}

const FORMAT_TOKEN = /\{(\d+)\}/g;

export interface ResxTokenEntry {
  readonly name: string;
  readonly tokens: readonly string[];
}

export function extractTokens(entries: readonly ResxEntry[]): readonly ResxTokenEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    tokens: [...new Set([...entry.value.matchAll(FORMAT_TOKEN)].map((match) => match[0]))].sort(),
  }));
}
