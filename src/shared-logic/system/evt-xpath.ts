import type { EventLevel, EventRecord } from './system-types';

/**
 * Pure helpers for the Event Log Viewer (DUDE_PRD.md Phase 31, Milestone 603): a filter model that
 * builds the structured XPath Event Viewer itself would write, Custom View XML import/export, and
 * ActivityID / PID / service / HRESULT extraction for cross-links. No Angular, no DOM.
 */

// ---- levels ---------------------------------------------------------------------------------

export const EVENT_LEVELS: readonly EventLevel[] = ['critical', 'error', 'warning', 'information', 'verbose'];

/** Numeric System/Level values. Information also matches 0 (LogAlways) exactly like Event Viewer's filter. */
export function levelNumbers(level: EventLevel): readonly number[] {
  switch (level) {
    case 'critical': return [1];
    case 'error': return [2];
    case 'warning': return [3];
    case 'information': return [4, 0];
    case 'verbose': return [5];
    default: return [];
  }
}

export function levelFromNumber(value: number): EventLevel {
  switch (value) {
    case 1: return 'critical';
    case 2: return 'error';
    case 3: return 'warning';
    case 0:
    case 4: return 'information';
    case 5: return 'verbose';
    default: return 'unknown';
  }
}

export function parseLevelName(text: string): EventLevel {
  const t = text.trim().toLowerCase();
  if (t.startsWith('crit')) return 'critical';
  if (t.startsWith('err')) return 'error';
  if (t.startsWith('warn')) return 'warning';
  if (t.startsWith('info')) return 'information';
  if (t.startsWith('verb')) return 'verbose';
  const n = Number(t);
  return t !== '' && Number.isInteger(n) ? levelFromNumber(n) : 'unknown';
}

export function formatLevel(level: EventLevel): string {
  return level === 'unknown' ? 'Unknown' : level.charAt(0).toUpperCase() + level.slice(1);
}

// ---- filter model -> XPath ------------------------------------------------------------------

export type EventRelativeRange = 'hour' | 'day' | 'week' | 'month';
export interface EventIdRange { readonly from: number; readonly to: number }

export interface EventTimeRange {
  readonly last?: EventRelativeRange;
  /** ISO timestamp; only events at/after this time. */
  readonly since?: string;
  /** ISO timestamp; only events at/before this time. */
  readonly until?: string;
}

export interface EventFilter {
  readonly levels?: readonly EventLevel[];
  readonly providers?: readonly string[];
  readonly eventIds?: readonly (number | EventIdRange)[];
  readonly timeRange?: EventTimeRange;
  /** Matches an EventData/Data value exactly (EvtQuery XPath has no substring function). */
  readonly keywordsText?: string;
  readonly activityId?: string;
}

const RANGE_MS: Readonly<Record<EventRelativeRange, number>> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
};

/** Quote an XPath string literal; a value holding both quote kinds has its double quotes dropped. */
export function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `'${value.replace(/"/g, '')}'`;
}

function orGroup(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Build a structured XPath query; an empty filter yields `*`. */
export function buildEventXPath(filter: EventFilter): string {
  const system: string[] = [];

  const providers = [...new Set((filter.providers ?? []).map((p) => p.trim()).filter(Boolean))];
  if (providers.length) system.push(orGroup(providers.map((p) => `Provider[@Name=${xpathLiteral(p)}]`)));

  const ids = (filter.eventIds ?? []).flatMap((entry): string[] => {
    if (typeof entry === 'number') return Number.isInteger(entry) && entry >= 0 ? [`EventID=${entry}`] : [];
    const { from, to } = entry;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) return [];
    if (from === to) return [`EventID=${from}`];
    return [`(EventID>=${Math.min(from, to)} and EventID<=${Math.max(from, to)})`];
  });
  if (ids.length) system.push(orGroup(ids));

  const levelParts = [...new Set((filter.levels ?? []).flatMap((l) => levelNumbers(l)))].map((n) => `Level=${n}`);
  if (levelParts.length) system.push(orGroup(levelParts));

  const range = filter.timeRange;
  if (range) {
    if (range.last && RANGE_MS[range.last]) {
      system.push(`TimeCreated[timediff(@SystemTime) <= ${RANGE_MS[range.last]}]`);
    } else {
      const since = isoOrNull(range.since);
      const until = isoOrNull(range.until);
      if (since && until) system.push(`TimeCreated[@SystemTime >= '${since}' and @SystemTime <= '${until}']`);
      else if (since) system.push(`TimeCreated[@SystemTime >= '${since}']`);
      else if (until) system.push(`TimeCreated[@SystemTime <= '${until}']`);
    }
  }

  const activity = filter.activityId?.trim();
  if (activity) system.push(`Correlation[@ActivityID=${xpathLiteral(activity)}]`);

  const clauses: string[] = [];
  if (system.length) clauses.push(`System[${system.join(' and ')}]`);
  const keyword = filter.keywordsText?.trim();
  if (keyword) clauses.push(`EventData[Data=${xpathLiteral(keyword)}]`);

  return clauses.length ? `*[${clauses.join(' and ')}]` : '*';
}

/** Add a record-id upper bound to an ordinary Event Viewer XPath so a caller can fetch older pages. */
export function beforeRecordXPath(xpath: string, recordId: string): string | null {
  if (!/^\d+$/.test(recordId)) return null;
  const query = xpath.trim() || '*';
  if (query === '*') return `*[System[EventRecordID < ${recordId}]]`;
  if (!query.startsWith('*[') || !query.endsWith(']')) return null;
  return `*[System[EventRecordID < ${recordId}] and (${query.slice(2, -1)})]`;
}
// ---- Custom View XML ------------------------------------------------------------------------

export interface CustomViewQuery {
  readonly channel: string;
  readonly xpath: string;
  readonly suppress: readonly string[];
}

export type CustomViewParse =
  | { readonly ok: true; readonly queries: readonly CustomViewQuery[] }
  | { readonly ok: false; readonly error: string };

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlText(text: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(text);
  if (cdata) return cdata[1];
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeXmlText(m[2] ?? m[3] ?? '') : null;
}

/** Extract every `<Select>` (and `<Suppress>`) of an Event Viewer Custom View / filter XML. */
export function parseCustomViewXml(xml: string): CustomViewParse {
  if (!/<QueryList[\s>]/.test(xml)) return { ok: false, error: 'Not a Custom View: no <QueryList> element found.' };
  const queries: CustomViewQuery[] = [];
  const queryRe = /<Query\b([^>]*)>([\s\S]*?)<\/Query\s*>/g;
  for (let q = queryRe.exec(xml); q; q = queryRe.exec(xml)) {
    const queryPath = attr(q[1], 'Path');
    const body = q[2];
    const suppress: string[] = [];
    const suppressRe = /<Suppress\b([^>]*)>([\s\S]*?)<\/Suppress\s*>/g;
    for (let s = suppressRe.exec(body); s; s = suppressRe.exec(body)) suppress.push(decodeXmlText(s[2]).trim());
    const selectRe = /<Select\b([^>]*)>([\s\S]*?)<\/Select\s*>/g;
    for (let s = selectRe.exec(body); s; s = selectRe.exec(body)) {
      const channel = attr(s[1], 'Path') ?? queryPath;
      if (!channel) continue;
      queries.push({ channel, xpath: decodeXmlText(s[2]).trim() || '*', suppress });
    }
  }
  if (!queries.length) return { ok: false, error: 'No <Select> query found in the XML.' };
  return { ok: true, queries };
}

/** Wrap a channel + XPath as an importable Event Viewer Custom View query list. */
export function toCustomViewXml(channel: string, xpath: string): string {
  const path = escapeXml(channel);
  return `<QueryList>\n  <Query Id="0" Path="${path}">\n    <Select Path="${path}">${escapeXml(xpath || '*')}</Select>\n  </Query>\n</QueryList>\n`;
}

// ---- correlation ----------------------------------------------------------------------------

export interface ActivityGroup {
  readonly activityId: string;
  readonly events: readonly EventRecord[];
}

const NIL_GUID = /^\{?0{8}-0{4}-0{4}-0{4}-0{12}\}?$/;

export function hasActivity(id: string | null | undefined): id is string {
  return !!id && !NIL_GUID.test(id);
}

/** Group events by ActivityID (ignoring absent/nil ids); groups keep first-seen order. */
export function groupByActivity(events: readonly EventRecord[]): readonly ActivityGroup[] {
  const map = new Map<string, EventRecord[]>();
  for (const e of events) {
    if (!hasActivity(e.activityId)) continue;
    const key = e.activityId.toLowerCase();
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()].map(([activityId, list]) => ({ activityId, events: list }));
}

export function relatedEvents(events: readonly EventRecord[], activityId: string): readonly EventRecord[] {
  const key = activityId.toLowerCase();
  return events.filter((e) => e.activityId?.toLowerCase() === key || e.relatedActivityId?.toLowerCase() === key);
}

function dataValue(xml: string, names: readonly string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`<Data\\s+Name=["']${name}["'][^>]*>([^<]*)</Data>`, 'i').exec(xml);
    if (m && m[1].trim()) return decodeXmlText(m[1]).trim();
  }
  return null;
}

/** PIDs an event refers to: the logging process plus any ProcessId-style EventData fields. */
export function extractPids(event: EventRecord): readonly number[] {
  const out = new Set<number>();
  if (event.processId && event.processId > 0) out.add(event.processId);
  const re = /<Data\s+Name=["'](?:New|Target|Parent|Creator)?Process(?:Id|ID)["'][^>]*>\s*(0x[0-9a-f]+|\d+)\s*</gi;
  for (let m = re.exec(event.xml); m; m = re.exec(event.xml)) {
    const pid = m[1].toLowerCase().startsWith('0x') ? parseInt(m[1], 16) : parseInt(m[1], 10);
    if (Number.isInteger(pid) && pid > 0) out.add(pid);
  }
  return [...out];
}

/** A service name mentioned by the event (Service Control Manager style events or a ServiceName field). */
export function extractServiceName(event: EventRecord): string | null {
  const explicit = dataValue(event.xml, ['ServiceName']);
  if (explicit) return explicit;
  if (/service control manager/i.test(event.providerName)) {
    const param = dataValue(event.xml, ['param1']);
    if (param) return param;
  }
  const m = /^The (.+?) service (?:entered|terminated|failed|was|has|is|depends|reached)/i.exec(event.message.trim());
  return m ? m[1] : null;
}

/** HRESULT / NTSTATUS / Win32-looking codes (0x + 8 hex digits) found in the message or XML. */
export function extractStatusCodes(event: EventRecord): readonly string[] {
  const found = new Set<string>();
  for (const text of [event.message, event.xml]) {
    for (const m of text.matchAll(/\b0x[0-9a-f]{8}\b/gi)) found.add(`0x${m[0].slice(2).toUpperCase()}`);
  }
  return [...found];
}
