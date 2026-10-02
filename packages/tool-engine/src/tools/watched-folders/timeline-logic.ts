import type { ChangeEvent } from "@dude/contracts/fs/watch-types";

/** Pure helpers for the Watched Folders timeline (Phase 29 items 10, 13): grouping and export. */

export function dayOf(iso: string): string { return iso.slice(0, 10); }

export function groupByDay(events: readonly ChangeEvent[]): { day: string; events: ChangeEvent[] }[] {
  const groups: { day: string; events: ChangeEvent[] }[] = [];
  for (const event of events) {
    const day = dayOf(event.at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.events.push(event); else groups.push({ day, events: [event] });
  }
  return groups;
}

export function describeEvent(event: ChangeEvent): string {
  switch (event.kind) {
    case 'renamed': return `${event.from} → ${event.path}`;
    case 'gap': return event.message ?? 'Some changes may be missing';
    case 'dude': return event.message ?? `DUDE batch operation (${event.count ?? 0} paths)`;
    default: return event.path + (event.isDir ? '/' : '');
  }
}

export function signedBytes(delta: number | undefined, format: (bytes: number) => string): string {
  if (delta === undefined || delta === 0) return '';
  return `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`;
}

function cell(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function timelineToCsv(events: readonly ChangeEvent[]): string {
  const lines = ['time,kind,path,from,size,size_delta,dude_plan'];
  for (const event of events) lines.push([event.at, event.kind, event.path, event.from, event.size, event.sizeDelta, event.planId].map(cell).join(','));
  return lines.join('\n') + '\n';
}
