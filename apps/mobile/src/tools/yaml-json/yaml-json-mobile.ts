import type { JsonIndent, YamlConvertResult, YamlDirection } from '@dude/tool-engine/tools/yaml-json/yaml-convert';

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const INPUT_TOO_LARGE = 'Input is larger than 2 MiB. Android converts up to 2 MiB of text at a time.';

export const DIRECTIONS: readonly { readonly id: YamlDirection; readonly label: string }[] = [
  { id: 'yaml-to-json', label: 'YAML to JSON' }, { id: 'json-to-yaml', label: 'JSON to YAML' },
];
export const INDENT_PREFIX = 'indent-';
export const INDENTS: readonly { readonly id: string; readonly value: JsonIndent; readonly label: string }[] = [
  { id: '2', value: 2, label: '2 spaces' }, { id: '4', value: 4, label: '4 spaces' }, { id: 'tab', value: 'tab', label: 'Tab' },
];
export const SAMPLES: Readonly<Record<YamlDirection, string>> = {
  'yaml-to-json': 'a: 1\nb:\n  - 2\n  - 3\n',
  'json-to-yaml': '{"a":1,"b":[2,3]}',
};

export const decodeDirection = (raw: unknown): YamlDirection | null => DIRECTIONS.find(direction => direction.id === raw)?.id ?? null;
/** The web tool stores the JSON indent as 2, 4 or 'tab'; a numeric string is tolerated. */
export function decodeIndent(raw: unknown): JsonIndent | null {
  if (raw === 2 || raw === 4 || raw === 'tab') return raw;
  if (raw === '2') return 2;
  if (raw === '4') return 4;
  return null;
}
export const indentId = (indent: JsonIndent): string => String(indent);
export const flipDirection = (direction: YamlDirection): YamlDirection => direction === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json';

export type YamlOutcome =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: string };

export function toOutcome(result: YamlConvertResult): YamlOutcome {
  return result.ok ? result : { ok: false, error: result.error.message };
}
