/** Pure, framework-free docker-compose YAML validation — a hand-written minimal Compose Specification shape check, not the full schema. */
import { load as loadYaml } from 'js-yaml';

export interface ComposeIssue {
  readonly path: string;
  readonly message: string;
}

export type ParseYamlResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

export function parseComposeDocument(text: string): ParseYamlResult {
  if (text.trim() === '') return { ok: false, error: 'Enter a docker-compose YAML document.' };
  try {
    return { ok: true, value: loadYaml(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse YAML.' };
  }
}

const PORT_RE = /^(\d+:)?\d+(\/(tcp|udp))?$/;

export type ComposeValidationResult =
  | { readonly ok: true; readonly issues: readonly ComposeIssue[] }
  | { readonly ok: false; readonly error: string };

export function validateCompose(text: string): ComposeValidationResult {
  const parsed = parseComposeDocument(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const doc = parsed.value;
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'A docker-compose file must be a YAML mapping (object) at the top level.' };
  }

  const issues: ComposeIssue[] = [];
  const root = doc as Record<string, unknown>;

  if ('version' in root) {
    issues.push({ path: 'version', message: 'The top-level "version" key is deprecated by the Compose Specification and can be omitted.' });
  }

  const services = root['services'];
  if (services === undefined || services === null || typeof services !== 'object' || Array.isArray(services)) {
    issues.push({ path: 'services', message: 'Missing or invalid "services" mapping.' });
    return { ok: true, issues };
  }

  for (const [name, definition] of Object.entries(services as Record<string, unknown>)) {
    if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
      issues.push({ path: `services.${name}`, message: 'Service definition must be a mapping.' });
      continue;
    }

    const service = definition as Record<string, unknown>;
    if (!('image' in service) && !('build' in service)) {
      issues.push({ path: `services.${name}`, message: 'Service has neither "image" nor "build".' });
    }

    const ports = service['ports'];
    if (Array.isArray(ports)) {
      ports.forEach((port, index) => {
        if (typeof port !== 'string' && typeof port !== 'number') return;
        if (!PORT_RE.test(String(port))) {
          issues.push({ path: `services.${name}.ports[${index}]`, message: `Port "${port}" doesn't look like "host:container" or a bare port number.` });
        }
      });
    }
  }

  return { ok: true, issues };
}
