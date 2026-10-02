/**
 * Pure, framework-free Java `.properties` <-> JSON conversion used by the
 * Properties File Parser tool. Shared as-is between the main thread (small
 * inputs) and `properties-convert.worker.ts` (large inputs).
 *
 * Implements the load/store grammar of `java.util.Properties` closely enough
 * for real-world files: `#`/`!` comments, `=`/`:`/whitespace key-value
 * separators, backslash line continuations, and `\n`/`\t`/`\r`/`\f`/`\uXXXX`
 * escapes. Values are kept as UTF-8 text rather than round-tripped through
 * ISO-8859-1 `\uXXXX` escaping on output, which is the one deliberate
 * simplification versus the Java spec.
 */

export type PropertiesDirection = 'properties-to-json' | 'json-to-properties';

export interface PropertiesConvertError {
  readonly message: string;
}

export type PropertiesConvertResult =
  | { readonly ok: true; readonly output: string }
  | { readonly ok: false; readonly error: PropertiesConvertError };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unescape(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char !== '\\' || i + 1 >= text.length) {
      result += char;
      continue;
    }
    const next = text[i + 1];
    if (next === 'u') {
      const hex = text.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        result += String.fromCharCode(parseInt(hex, 16));
        i += 5;
        continue;
      }
    }
    const mapped: Record<string, string> = { n: '\n', t: '\t', r: '\r', f: '\f' };
    result += mapped[next] ?? next;
    i += 1;
  }
  return result;
}

/** Joins backslash-continued logical lines (an odd number of trailing backslashes continues). */
function joinContinuations(lines: readonly string[]): string[] {
  const joined: string[] = [];
  let buffer = '';
  let continuing = false;

  for (const rawLine of lines) {
    const line = continuing ? rawLine.replace(/^[ \t\f]+/, '') : rawLine;
    buffer += line;

    let trailingBackslashes = 0;
    for (let i = buffer.length - 1; i >= 0 && buffer[i] === '\\'; i--) trailingBackslashes++;

    if (trailingBackslashes % 2 === 1) {
      buffer = buffer.slice(0, -1);
      continuing = true;
    } else {
      joined.push(buffer);
      buffer = '';
      continuing = false;
    }
  }
  if (continuing) joined.push(buffer);

  return joined;
}

function splitKeyValue(line: string): { key: string; value: string } {
  let i = 0;
  while (i < line.length) {
    const char = line[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '=' || char === ':' || char === ' ' || char === '\t') break;
    i++;
  }

  const rawKey = line.slice(0, i);
  let rest = line.slice(i).replace(/^[ \t]+/, '');
  if (rest[0] === '=' || rest[0] === ':') {
    rest = rest.slice(1).replace(/^[ \t]+/, '');
  }

  return { key: unescape(rawKey), value: unescape(rest) };
}

function parseProperties(input: string): Record<string, string> {
  const lines = input.split(/\r\n|\r|\n/);
  const record: Record<string, string> = {};

  for (const logicalLine of joinContinuations(lines)) {
    const trimmed = logicalLine.replace(/^[ \t\f]+/, '');
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;

    const { key, value } = splitKeyValue(trimmed);
    if (key === '') continue;
    record[key] = value;
  }

  return record;
}

function escapeKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/[:=]/g, '\\$&').replace(/ /g, '\\ ');
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/^ /, '\\ ');
}

function formatProperties(record: Record<string, unknown>): PropertiesConvertResult {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (value === null || typeof value === 'object') {
      return {
        ok: false,
        error: { message: `Value for "${key}" must be a string, number, or boolean — flatten nested JSON first.` },
      };
    }
    lines.push(`${escapeKey(key)}=${escapeValue(String(value))}`);
  }
  return { ok: true, output: lines.length === 0 ? '' : `${lines.join('\n')}\n` };
}

export function convertProperties(input: string, direction: PropertiesDirection): PropertiesConvertResult {
  if (input.trim() === '') {
    return { ok: false, error: { message: direction === 'properties-to-json' ? 'Enter a .properties file.' : 'Enter some JSON.' } };
  }

  if (direction === 'properties-to-json') {
    return { ok: true, output: JSON.stringify(parseProperties(input), null, 2) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: { message: 'Top-level JSON must be a flat object to convert to .properties.' } };
  }

  return formatProperties(parsed);
}
