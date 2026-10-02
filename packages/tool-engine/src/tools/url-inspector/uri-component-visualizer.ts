/**
 * Pure, framework-free segmentation of a raw URI reference into generic-syntax
 * components (RFC 3986 §3 / Appendix B), for a colorized breakdown view — deliberately
 * operates on the raw string as typed rather than `url-parts.ts`'s normalized `URL` object,
 * so a partial or invalid-per-`URL()` string can still be visualized segment-by-segment.
 */
export type UriComponentKind =
  | 'scheme'
  | 'userinfo'
  | 'host'
  | 'port'
  | 'path'
  | 'query'
  | 'fragment'
  | 'punctuation';

export interface UriSegment {
  readonly kind: UriComponentKind;
  readonly text: string;
}

// Matches RFC 3986 Appendix B's generic-syntax grouping, extended with named groups and
// the `d` (indices) flag so authority can be re-sliced without manual offset arithmetic.
const URI_REGEX =
  /^(?:(?<scheme>[^:/?#]+)(?<schemeColon>:))?(?:(?<slashes>\/\/)(?<authority>[^/?#]*))?(?<path>[^?#]*)(?:(?<queryMark>\?)(?<query>[^#]*))?(?:(?<fragmentMark>#)(?<fragment>.*))?$/d;

const AUTHORITY_REGEX = /^(?:(?<userinfo>[^@]*)(?<at>@))?(?<host>[^:]*)(?:(?<portColon>:)(?<port>.*))?$/d;

const GROUP_KIND: Record<string, UriComponentKind> = {
  scheme: 'scheme',
  schemeColon: 'punctuation',
  slashes: 'punctuation',
  path: 'path',
  queryMark: 'punctuation',
  query: 'query',
  fragmentMark: 'punctuation',
  fragment: 'fragment',
  userinfo: 'userinfo',
  at: 'punctuation',
  host: 'host',
  portColon: 'punctuation',
  port: 'port',
};

type NamedGroups = Record<string, string | undefined>;
type NamedGroupIndices = Record<string, readonly [number, number] | undefined>;

interface IndexedMatch {
  readonly groups?: NamedGroups;
  readonly indices?: { readonly groups?: NamedGroupIndices };
}

export function segmentUri(raw: string): readonly UriSegment[] {
  if (raw === '') return [];

  const match = URI_REGEX.exec(raw) as IndexedMatch;
  const groups = match.groups ?? {};
  const indices = match.indices?.groups ?? {};

  const entries: { start: number; kind: UriComponentKind; text: string }[] = [];

  for (const [name, text] of Object.entries(groups)) {
    if (text === undefined || text === '') continue;
    if (name === 'authority') continue; // re-sliced below into userinfo/host/port
    const range = indices[name];
    if (!range) continue;
    entries.push({ start: range[0], kind: GROUP_KIND[name], text });
  }

  const authorityRange = indices['authority'];
  const authorityText = groups['authority'];
  if (authorityRange && authorityText !== undefined && authorityText !== '') {
    const subMatch = AUTHORITY_REGEX.exec(authorityText) as IndexedMatch;
    const subGroups = subMatch.groups ?? {};
    const subIndices = subMatch.indices?.groups ?? {};
    for (const [name, text] of Object.entries(subGroups)) {
      if (text === undefined || text === '') continue;
      const range = subIndices[name];
      if (!range) continue;
      entries.push({ start: authorityRange[0] + range[0], kind: GROUP_KIND[name], text });
    }
  }

  entries.sort((a, b) => a.start - b.start);
  return entries.map(({ kind, text }) => ({ kind, text }));
}

export const URI_COMPONENT_LEGEND: ReadonlyArray<{ readonly kind: UriComponentKind; readonly label: string }> = [
  { kind: 'scheme', label: 'Scheme' },
  { kind: 'userinfo', label: 'Userinfo' },
  { kind: 'host', label: 'Host' },
  { kind: 'port', label: 'Port' },
  { kind: 'path', label: 'Path' },
  { kind: 'query', label: 'Query' },
  { kind: 'fragment', label: 'Fragment' },
];
