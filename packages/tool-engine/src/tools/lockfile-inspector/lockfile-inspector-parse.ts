import { parseNpmLockfile } from "./lockfile-inspector-npm.js";
import { parsePnpmLockfile } from "./lockfile-inspector-pnpm.js";
import { LockfileFormat, NormalizedPackage } from "./lockfile-inspector-types.js";
import { parseYarnBerryLockfile } from "./lockfile-inspector-yarn-berry.js";
import { parseYarnClassicLockfile } from "./lockfile-inspector-yarn-classic.js";

/** Sniffs the format from the filename first (most reliable), falling back to content shape. */
export function detectLockfileFormat(filename: string, content: string): LockfileFormat | 'unknown' {
  const trimmed = content.trim();

  if (filename.endsWith('package-lock.json')) return 'npm';
  if (filename.endsWith('pnpm-lock.yaml')) return 'pnpm';
  if (filename.endsWith('yarn.lock')) return /^__metadata:/m.test(trimmed) ? 'yarn-berry' : 'yarn-classic';

  if (trimmed.startsWith('{')) return 'npm';
  if (/^__metadata:/m.test(trimmed)) return 'yarn-berry';
  if (/^lockfileVersion:/m.test(trimmed)) return 'pnpm';
  if (/^# yarn lockfile v1/m.test(trimmed) || /^\S.*:\s*$/m.test(trimmed)) return 'yarn-classic';

  return 'unknown';
}

export type LockfileParseResult =
  | { readonly ok: true; readonly format: LockfileFormat; readonly packages: readonly NormalizedPackage[] }
  | { readonly ok: false; readonly error: string };

/** Parses with an explicitly chosen format, bypassing filename/content sniffing — used for pasted content, which has no filename. */
export function parseLockfileAs(format: LockfileFormat, content: string): LockfileParseResult {
  try {
    switch (format) {
      case 'npm':
        return { ok: true, format, packages: parseNpmLockfile(JSON.parse(content)) };
      case 'pnpm':
        return { ok: true, format, packages: parsePnpmLockfile(content) };
      case 'yarn-berry':
        return { ok: true, format, packages: parseYarnBerryLockfile(content) };
      case 'yarn-classic':
        return { ok: true, format, packages: parseYarnClassicLockfile(content) };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse this lockfile.' };
  }
}

export function parseLockfile(filename: string, content: string): LockfileParseResult {
  const format = detectLockfileFormat(filename, content);
  if (format === 'unknown') {
    return { ok: false, error: 'Could not recognize this as a package-lock.json, pnpm-lock.yaml, or yarn.lock file.' };
  }
  return parseLockfileAs(format, content);
}
