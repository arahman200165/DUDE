import type { InstalledSoftware } from '../../../shared-logic/system/software-types';

export type SoftwareSort = 'name' | 'size' | 'date' | 'publisher';

export function sortSoftware(rows: readonly InstalledSoftware[], sort: SoftwareSort, descending = false): InstalledSoftware[] {
  const result = [...rows].sort((a, b) => {
    const av = sort === 'size' ? a.estimatedSizeBytes : sort === 'date' ? a.installDate : sort === 'publisher' ? a.publisher : a.name;
    const bv = sort === 'size' ? b.estimatedSizeBytes : sort === 'date' ? b.installDate : sort === 'publisher' ? b.publisher : b.name;
    const cmp = av == null ? (bv == null ? 0 : 1) : bv == null ? -1 : typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return (cmp || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) * (descending ? -1 : 1);
  });
  return result;
}

export function filterSoftware(rows: readonly InstalledSoftware[], query: string): InstalledSoftware[] {
  const q = query.trim().toLocaleLowerCase();
  return q ? rows.filter((row) => [row.name, row.publisher, row.version, row.source].some((v) => v?.toLocaleLowerCase().includes(q))) : [...rows];
}

export function softwareCsv(rows: readonly InstalledSoftware[]): string {
  const fields: (keyof InstalledSoftware)[] = ['name', 'publisher', 'version', 'source', 'installDate', 'estimatedSizeBytes', 'installLocation', 'id'];
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [fields.map(quote).join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\r\n');
}

export function uninstallRequest(row: InstalledSoftware) {
  const match = row.id.match(/^(HKLM|HKCU):(64|32|default):([^\\]+)$/);
  if (!match || !row.uninstallable || !row.uninstallCommand) throw new Error('This entry has no supported interactive uninstaller.');
  const [, hive, view, keyName] = match;
  return { kind: 'software.uninstall', params: { hive, view, keyName, displayName: row.name, uninstallString: row.uninstallCommand } };
}

export function appxRemovalCommand(row: InstalledSoftware): string {
  const packageName = row.id.startsWith('appx:') ? row.id.slice(5) : row.name;
  return `Get-AppxPackage -PackageTypeFilter Main | Where-Object { $_.PackageFullName -eq '${packageName.replaceAll("'", "''")}' } | Remove-AppxPackage`;
}

export function formatBytes(value: number | null): string {
  if (value == null) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = -1;
  do { size /= 1024; unit++; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}
