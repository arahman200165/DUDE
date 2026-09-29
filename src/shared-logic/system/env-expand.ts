/**
 * Expands `%NAME%` references the way Windows does for REG_EXPAND_SZ values: names match
 * case-insensitively against `env`; unknown references are left as written. A single pass, so a
 * substituted value is never rescanned (no recursion, no cycles).
 */
export function expandEnvStrings(value: string, env: ReadonlyMap<string, string> | Readonly<Record<string, string>>): string {
  const lookup = new Map<string, string>();
  const pairs = env instanceof Map ? [...env] : Object.entries(env);
  for (const [name, v] of pairs) lookup.set(name.toLowerCase(), v);
  return value.replace(/%([^%\r\n]+)%/g, (whole, name: string) => lookup.get(name.toLowerCase()) ?? whole);
}
