/** Splits an arbitrary-cased JSON key (camelCase, snake_case, kebab-case, PascalCase) into lowercase word tokens. */
function tokenize(key: string): readonly string[] {
  return key
    .replace(/[-_\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function toPascalCase(key: string): string {
  const words = tokenize(key);
  return words.length > 0 ? words.map(capitalize).join('') : 'Value';
}

export function toCamelCase(key: string): string {
  const [first, ...rest] = tokenize(key);
  if (first === undefined) return 'value';
  return first + rest.map(capitalize).join('');
}

export function toSnakeCase(key: string): string {
  const words = tokenize(key);
  return words.length > 0 ? words.join('_') : 'value';
}

/** A field name in the target casing is a valid identifier iff it isn't reused for a different concept — call sites decide when to add an original-key annotation instead of relying on this alone. */
export function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
