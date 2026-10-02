export type UuidExportFormat = 'txt' | 'json' | 'csv';

export interface UuidExport {
  readonly text: string;
  readonly filename: string;
  readonly mimeType: string;
}

export function formatUuidExport(values: readonly string[], format: UuidExportFormat): UuidExport {
  if (format === 'json') {
    return { text: JSON.stringify(values, null, 2), filename: 'uuids.json', mimeType: 'application/json' };
  }
  if (format === 'csv') {
    const rows = ['uuid', ...values].join('\n');
    return { text: rows, filename: 'uuids.csv', mimeType: 'text/csv' };
  }
  return { text: values.join('\n'), filename: 'uuids.txt', mimeType: 'text/plain' };
}
