import type { EventChannel, EventLevel, EventRecord } from '../../../shared-logic/system/system-types';
import type { EventIdRange } from '../../../shared-logic/system/evt-xpath';
import type { StatusGlyphKind } from '../../shared/components/status-glyph/status-glyph';

export const MAX_BUFFER = 2000;

/** Parse "1000, 4624-4634, 7" into ids and ranges; invalid tokens are ignored. */
export function parseEventIds(text: string): readonly (number | EventIdRange)[] {
  const out: (number | EventIdRange)[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (range) out.push({ from: Number(range[1]), to: Number(range[2]) });
    else if (/^\d+$/.test(token)) out.push(Number(token));
  }
  return out;
}

export function parseProviders(text: string): readonly string[] {
  return text.split(/[;\n]+/).map((p) => p.trim()).filter(Boolean);
}

const GROUP_ORDER: readonly EventChannel['type'][] = ['classic', 'admin', 'operational', 'analytic', 'debug'];
const GROUP_LABEL: Readonly<Record<EventChannel['type'], string>> = {
  classic: 'Windows logs', admin: 'Admin', operational: 'Operational', analytic: 'Analytic', debug: 'Debug',
};

export interface ChannelGroup { readonly type: EventChannel['type']; readonly label: string; readonly channels: readonly EventChannel[] }

export function groupChannels(channels: readonly EventChannel[], filter: string): readonly ChannelGroup[] {
  const needle = filter.trim().toLowerCase();
  const visible = needle ? channels.filter((c) => c.name.toLowerCase().includes(needle)) : channels;
  return GROUP_ORDER.flatMap((type) => {
    const list = visible.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name));
    return list.length ? [{ type, label: GROUP_LABEL[type], channels: list }] : [];
  });
}

export function newestRecordId(events: readonly EventRecord[]): string | null {
  let best: bigint | null = null;
  for (const e of events) {
    try {
      const id = BigInt(e.recordId);
      if (best === null || id > best) best = id;
    } catch { /* non-numeric record ids are ignored */ }
  }
  return best === null ? null : best.toString();
}

/** Prepend newly polled events (any order) newest-first, dropping duplicates and bounding the buffer. */
export function prependNewer(current: readonly EventRecord[], fresh: readonly EventRecord[], max = MAX_BUFFER): readonly EventRecord[] {
  if (!fresh.length) return current;
  const seen = new Set(current.map((e) => e.recordId));
  const added = fresh.filter((e) => !seen.has(e.recordId));
  const ordered = [...added].sort((a, b) => {
    try { return BigInt(b.recordId) > BigInt(a.recordId) ? 1 : -1; } catch { return 0; }
  });
  return [...ordered, ...current].slice(0, max);
}

export function glyphFor(level: EventLevel): StatusGlyphKind {
  switch (level) {
    case 'critical':
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'information': return 'info';
    default: return 'neutral';
  }
}

export function formatEventTime(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
}
