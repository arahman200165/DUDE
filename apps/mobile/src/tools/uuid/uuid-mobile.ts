import {
  decodeV1Timestamp, decodeV6Timestamp, decodeV7Timestamp, generateUuid, inspectUuid, PREDEFINED_NAMESPACES, type UuidVersion,
} from '@dude/tool-engine/tools/uuid/uuid-tool';
import type { KeyValueRow, ToolRunResult } from '../../kit/text-tool-controller';

export const UUID_VERSIONS: readonly UuidVersion[] = ['v1', 'v3', 'v4', 'v5', 'v6', 'v7'];
export const MAX_UUID_COUNT = 100;
export type UuidMobileOptions = {
  readonly version: string;
  readonly count: number;
  readonly namespaceChoice: string;
  readonly customNamespace: string;
};

/** Generate mode: `name` (the screen input) only matters for the name-based v3/v5, which are deterministic and so always one value. */
export function generateUuids(name: string, options: UuidMobileOptions): ToolRunResult {
  const version = (UUID_VERSIONS as readonly string[]).includes(options.version) ? options.version as UuidVersion : 'v4';
  const namespace = options.namespaceChoice === 'custom'
    ? options.customNamespace.trim()
    : PREDEFINED_NAMESPACES[options.namespaceChoice as keyof typeof PREDEFINED_NAMESPACES] ?? PREDEFINED_NAMESPACES.DNS;
  const count = version === 'v3' || version === 'v5' ? 1 : Math.min(MAX_UUID_COUNT, Math.max(1, Math.trunc(options.count) || 1));
  const values: string[] = [];
  for (let index = 0; index < count; index++) {
    const result = generateUuid(version, { namespace, name: name.trim() });
    if (!result.ok) return { ok: false, error: result.error };
    values.push(result.value);
  }
  return { ok: true, output: values.join('\n') };
}

/** Inspect mode: validity, version, variant and the embedded timestamp for v1/v6/v7. */
export function inspectUuidRows(input: string): ToolRunResult {
  const value = input.trim();
  if (value === '') return { ok: false, error: 'Enter a UUID to inspect.' };
  const inspection = inspectUuid(value);
  if (!inspection.valid) return { ok: false, error: 'Not a valid UUID (expected 8-4-4-4-12 hex digits, version 1 to 8).' };
  const timestamp = inspection.version === 1 ? decodeV1Timestamp(value)
    : inspection.version === 6 ? decodeV6Timestamp(value)
      : inspection.version === 7 ? decodeV7Timestamp(value) : null;
  const rows: KeyValueRow[] = [
    { key: 'valid', label: 'Valid', value: 'yes' },
    { key: 'version', label: 'Version', value: String(inspection.version) },
    { key: 'variant', label: 'Variant', value: inspection.variant ?? '' },
  ];
  if (timestamp && Number.isFinite(timestamp.getTime())) rows.push({ key: 'timestamp', label: 'Timestamp (UTC)', value: timestamp.toISOString() });
  return { ok: true, output: rows };
}
