/**
 * Pure, framework-free parse/build for the `Content-Security-Policy:` header — a
 * semicolon-separated list of directives, each a name followed by space-separated
 * source values (most directives) or no values at all (a handful of boolean directives).
 */
export interface CspDirectiveDef {
  readonly name: string;
  readonly hasValues: boolean;
}

export const CSP_DIRECTIVES: readonly CspDirectiveDef[] = [
  { name: 'default-src', hasValues: true },
  { name: 'script-src', hasValues: true },
  { name: 'style-src', hasValues: true },
  { name: 'img-src', hasValues: true },
  { name: 'connect-src', hasValues: true },
  { name: 'font-src', hasValues: true },
  { name: 'object-src', hasValues: true },
  { name: 'media-src', hasValues: true },
  { name: 'frame-src', hasValues: true },
  { name: 'frame-ancestors', hasValues: true },
  { name: 'base-uri', hasValues: true },
  { name: 'form-action', hasValues: true },
  { name: 'worker-src', hasValues: true },
  { name: 'manifest-src', hasValues: true },
  { name: 'report-uri', hasValues: true },
  { name: 'report-to', hasValues: true },
  { name: 'upgrade-insecure-requests', hasValues: false },
  { name: 'block-all-mixed-content', hasValues: false },
];

export interface CspDirective {
  readonly name: string;
  readonly values: readonly string[];
}

export function parseCsp(raw: string): readonly CspDirective[] {
  return raw
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')
    .map((segment) => {
      const tokens = segment.split(/\s+/).filter((t) => t !== '');
      return { name: tokens[0], values: tokens.slice(1) };
    });
}

export function buildCsp(directives: readonly CspDirective[]): string {
  return directives
    .filter((d) => d.name !== '')
    .map((d) => (d.values.length > 0 ? `${d.name} ${d.values.join(' ')}` : d.name))
    .join('; ');
}

/** Heuristic checks for directive combinations that weaken CSP's protection. */
export function checkCspWarnings(directives: readonly CspDirective[]): readonly string[] {
  const warnings: string[] = [];

  for (const directive of directives) {
    if (directive.name !== 'script-src' && directive.name !== 'default-src') continue;

    if (directive.values.includes("'unsafe-inline'")) {
      warnings.push(`${directive.name} includes 'unsafe-inline', which defeats much of CSP's protection against inline-script XSS.`);
    }
    if (directive.values.includes("'unsafe-eval'")) {
      warnings.push(`${directive.name} includes 'unsafe-eval', allowing eval()-like dynamic code execution.`);
    }
    if (directive.values.includes('*')) {
      warnings.push(`${directive.name} includes '*', allowing scripts from any origin.`);
    }
  }

  return warnings;
}
