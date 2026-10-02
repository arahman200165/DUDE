/**
 * Pure, framework-free cross-check between environment variables referenced
 * in source text (`process.env.X`, `process.env['X']`, `os.environ['X']`,
 * `os.environ.get('X')`, `${X}`, `$X`) and the keys declared in a pasted
 * `.env` file, reusing the .env Editor's `envToObject`.
 */
import { envToObject } from "../env-editor/env-format.js";

const REFERENCE_PATTERNS: readonly RegExp[] = [
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
  /os\.environ\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
  /os\.environ\.get\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
  /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
  /\$([A-Za-z_][A-Za-z0-9_]*)/g,
];

export function extractReferencedVars(sourceText: string): readonly string[] {
  const found = new Set<string>();

  for (const pattern of REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sourceText))) found.add(match[1]);
  }

  return Array.from(found).sort();
}

export interface MissingEnvVarReport {
  readonly referencedButNotDeclared: readonly string[];
  readonly declaredButNotReferenced: readonly string[];
}

export function findMissingEnvVars(sourceText: string, envText: string): MissingEnvVarReport {
  const referenced = new Set(extractReferencedVars(sourceText));
  const declared = new Set(Object.keys(envToObject(envText)));

  return {
    referencedButNotDeclared: Array.from(referenced)
      .filter((name) => !declared.has(name))
      .sort(),
    declaredButNotReferenced: Array.from(declared)
      .filter((name) => !referenced.has(name))
      .sort(),
  };
}
