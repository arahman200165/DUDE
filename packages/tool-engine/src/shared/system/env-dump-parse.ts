/**
 * Parses a pasted environment dump into an ordered name-to-value map. Accepts `NAME=VALUE` lines (the
 * `set` and `.env` shapes) or a JSON object. Blank lines, `#` / `;` comment lines and cmd's hidden
 * `=C:=C:\dir` drive entries are ignored. Later duplicates (case-insensitive) replace earlier ones.
 */
export function parseEnvDump(text: string): Map<string, string> {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return parseJson(trimmed);

  const result = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('=')) continue;
    line = line.replace(/^export\s+/, '');
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    if (!name) continue;
    const value = unquote(line.slice(eq + 1).trim());
    const existing = seen.get(name.toLowerCase());
    if (existing !== undefined) result.delete(existing);
    seen.set(name.toLowerCase(), name);
    result.set(name, value);
  }
  return result;
}

function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) return value.slice(1, -1);
  return value;
}

function parseJson(text: string): Map<string, string> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object of NAME: value pairs.');
  const result = new Map<string, string>();
  for (const [name, value] of Object.entries(parsed)) result.set(name, typeof value === 'string' ? value : JSON.stringify(value));
  return result;
}
