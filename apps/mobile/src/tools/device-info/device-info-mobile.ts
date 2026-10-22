import { DEVICE_FACT_GROUPS, DEVICE_GROUP_TITLES, type DeviceFactGroup, type DeviceReport } from '@dude/tool-engine/tools/device-info/device-report';
import type { KeyValueRow } from '../../kit';

export interface DeviceSection {
  readonly group: DeviceFactGroup;
  readonly title: string;
  readonly rows: readonly KeyValueRow[];
}

/** Row key: the fact id without its group prefix (`display.pixel-ratio` -> `pixel-ratio`), so testIDs read `kv-pixel-ratio-value`. */
export function rowKey(id: string, group: DeviceFactGroup): string {
  return id.startsWith(`${group}.`) ? id.slice(group.length + 1) : id;
}

/** Groups a report's facts into display sections (non-empty groups only, engine group order). */
export function reportSections(report: DeviceReport): DeviceSection[] {
  const sections: DeviceSection[] = [];
  for (const group of DEVICE_FACT_GROUPS) {
    const rows = report.facts.filter(fact => fact.group === group).map(fact => ({ key: rowKey(fact.id, group), label: fact.label, value: fact.value }));
    if (rows.length) sections.push({ group, title: DEVICE_GROUP_TITLES[group], rows });
  }
  return sections;
}
