import { NormalizedPackage } from "./lockfile-inspector-types.js";

function stripQuotes(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function nameFromDeclaration(declaration: string): string {
  const unquoted = stripQuotes(declaration.trim());
  const at = unquoted.lastIndexOf('@');
  return at > 0 ? unquoted.slice(0, at) : unquoted;
}

/** Parses a classic (Yarn v1) yarn.lock: comma-separated range declarations followed by an indented key/value block. */
export function parseYarnClassicLockfile(text: string): readonly NormalizedPackage[] {
  const lines = text.split('\n');
  const results: NormalizedPackage[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '' || line.startsWith('#') || !/^\S/.test(line) || !line.trim().endsWith(':')) {
      i++;
      continue;
    }

    const name = nameFromDeclaration(line.trim().slice(0, -1).split(',')[0]);
    i++;

    let version = '';
    let resolved: string | null = null;
    const dependencies: string[] = [];

    while (i < lines.length && /^\s+\S/.test(lines[i])) {
      const trimmedBody = lines[i].trim();

      if (trimmedBody.startsWith('version ')) {
        version = stripQuotes(trimmedBody.slice('version '.length).trim());
        i++;
      } else if (trimmedBody.startsWith('resolved ')) {
        resolved = stripQuotes(trimmedBody.slice('resolved '.length).trim());
        i++;
      } else if (trimmedBody === 'dependencies:' || trimmedBody === 'optionalDependencies:') {
        i++;
        while (i < lines.length && /^ {4}\S/.test(lines[i])) {
          const match = lines[i].trim().match(/^("?[^"\s]+"?)\s+"?[^"]*"?$/);
          if (match) dependencies.push(stripQuotes(match[1]));
          i++;
        }
      } else {
        i++;
      }
    }

    results.push({ name, version, resolved, dependencies });
  }

  return results;
}
