import { parseUserAgent } from '../user-agent/ua-parse.js';

/** Fact groups in display order. */
export const DEVICE_FACT_GROUPS = ['runtime', 'display', 'locale', 'hardware', 'os', 'network'] as const;
export type DeviceFactGroup = (typeof DEVICE_FACT_GROUPS)[number];
export type DeviceSurface = 'web' | 'desktop' | 'android';

export interface DeviceFact {
  /** Stable machine id, unique within a report (for example `display.dpr`). */
  readonly id: string;
  readonly group: DeviceFactGroup;
  readonly label: string;
  readonly value: string;
}

export interface DeviceReport {
  readonly facts: readonly DeviceFact[];
  /** ISO-8601 timestamp of collection. */
  readonly collectedAt: string;
  readonly surface: DeviceSurface;
}

export const DEVICE_GROUP_TITLES: Readonly<Record<DeviceFactGroup, string>> = {
  runtime: 'Runtime',
  display: 'Display',
  locale: 'Locale',
  hardware: 'Hardware',
  os: 'Operating system',
  network: 'Network and storage',
};

const GROUP_RANK: Readonly<Record<DeviceFactGroup, number>> = Object.fromEntries(
  DEVICE_FACT_GROUPS.map((group, index) => [group, index]),
) as Record<DeviceFactGroup, number>;

/**
 * Normalizes collected facts into a report: drops facts with a blank id, label or value, keeps the
 * first fact for a repeated id, and sorts by group order then label. Pure: the clock is injected.
 */
export function buildDeviceReport(surface: DeviceSurface, partialFacts: readonly DeviceFact[], now: Date): DeviceReport {
  const seen = new Set<string>();
  const facts: DeviceFact[] = [];
  for (const fact of partialFacts) {
    const value = fact.value.trim();
    if (fact.id === '' || fact.label === '' || value === '' || seen.has(fact.id)) continue;
    seen.add(fact.id);
    facts.push({ ...fact, value });
  }
  facts.sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { facts, collectedAt: now.toISOString(), surface };
}

/** Plain-text report: one heading per non-empty group, `Label: value` rows aligned to the widest label. */
export function formatDeviceReportText(report: DeviceReport): string {
  const width = report.facts.reduce((max, fact) => Math.max(max, fact.label.length), 0);
  const lines: string[] = [`Device report (${report.surface}) - ${report.collectedAt}`];
  for (const group of DEVICE_FACT_GROUPS) {
    const rows = report.facts.filter((fact) => fact.group === group);
    if (rows.length === 0) continue;
    lines.push('', DEVICE_GROUP_TITLES[group]);
    for (const fact of rows) lines.push(`  ${`${fact.label}:`.padEnd(width + 3)}${fact.value}`);
  }
  return lines.join('\n');
}

/** JSON report: surface, timestamp and facts keyed by id inside their group. */
export function formatDeviceReportJson(report: DeviceReport): string {
  const groups: Record<string, Record<string, string>> = {};
  for (const group of DEVICE_FACT_GROUPS) {
    const rows = report.facts.filter((fact) => fact.group === group);
    if (rows.length === 0) continue;
    groups[group] = Object.fromEntries(rows.map((fact) => [fact.id, fact.value]));
  }
  return JSON.stringify({ surface: report.surface, collectedAt: report.collectedAt, facts: groups }, null, 2);
}

/** Human-readable byte size using binary units, for example `8 GiB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 || value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${text} ${units[unit]}`;
}

/** Browser, engine and OS facts parsed from a User-Agent string, reusing the User-Agent tool's engine. */
export function userAgentSummaryFacts(userAgent: string): DeviceFact[] {
  const result = parseUserAgent(userAgent);
  if (!result.ok) return [];
  const join = (part: { readonly name?: string; readonly version?: string }) => [part.name, part.version].filter(Boolean).join(' ');
  return [
    { id: 'runtime.browser', group: 'runtime', label: 'Browser', value: join(result.parsed.browser) },
    { id: 'runtime.engine', group: 'runtime', label: 'Engine', value: join(result.parsed.engine) },
    { id: 'os.ua-os', group: 'os', label: 'OS (from user agent)', value: join(result.parsed.os) },
  ];
}
