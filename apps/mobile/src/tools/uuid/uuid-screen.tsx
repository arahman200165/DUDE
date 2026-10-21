import { defineTextTool, type OptionSpec } from '../../kit';
import { generateUuids, inspectUuidRows, MAX_UUID_COUNT, UUID_VERSIONS, type UuidMobileOptions } from './uuid-mobile';

// Preference keys follow the web tool: `version`, `namespaceChoice`, `customNamespace` (and the kit's default `mode`).
const options: readonly OptionSpec[] = [
  { kind: 'select', id: 'version', label: 'Version', default: 'v4', choices: UUID_VERSIONS.map(value => ({ value, label: value })) },
  { kind: 'number', id: 'count', label: `How many (1 to ${MAX_UUID_COUNT}; v3 and v5 are always one)`, default: 1, min: 1, max: MAX_UUID_COUNT },
  { kind: 'select', id: 'namespaceChoice', label: 'Namespace (v3 and v5)', default: 'DNS', choices: ['DNS', 'URL', 'OID', 'X500', 'custom'].map(value => ({ value, label: value })) },
  { kind: 'text', id: 'customNamespace', label: 'Custom namespace UUID', default: '' },
];

export default defineTextTool<UuidMobileOptions>({
  toolId: 'uuid',
  modes: [
    { id: 'generate', label: 'Generate', run: (name, values) => generateUuids(name, values) },
    { id: 'inspect', label: 'Inspect', run: input => inspectUuidRows(input) },
  ],
  options,
  live: false,
  allowEmptyInput: true,
  outputKind: 'kv',
  inputLabel: 'Name (v3/v5) or UUID to inspect',
  outputLabel: 'UUIDs',
});
