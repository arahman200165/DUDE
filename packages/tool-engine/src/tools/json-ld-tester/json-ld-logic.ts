import { SCHEMA_RULES } from "./json-ld-schema-rules.js";

export interface JsonLdFinding {
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export type JsonLdValidationResult =
  | { readonly ok: true; readonly findings: readonly JsonLdFinding[] }
  | { readonly ok: false; readonly parseError: string };

function isSchemaContext(context: unknown): boolean {
  if (typeof context === 'string') return context.includes('schema.org');
  if (Array.isArray(context)) return context.some(isSchemaContext);
  if (context && typeof context === 'object') return isSchemaContext((context as { '@vocab'?: unknown })['@vocab']);
  return false;
}

function validateNode(node: Record<string, unknown>, label: string): JsonLdFinding[] {
  const findings: JsonLdFinding[] = [];

  const context = node['@context'];
  if (context === undefined) {
    findings.push({ severity: 'error', message: `${label}: missing "@context".` });
  } else if (!isSchemaContext(context)) {
    findings.push({ severity: 'warning', message: `${label}: "@context" doesn't appear to reference schema.org.` });
  }

  const rawType = node['@type'];
  if (rawType === undefined) {
    findings.push({ severity: 'error', message: `${label}: missing "@type".` });
    return findings;
  }

  const types = Array.isArray(rawType) ? rawType : [rawType];
  for (const type of types) {
    if (typeof type !== 'string') {
      findings.push({ severity: 'error', message: `${label}: "@type" must be a string (or array of strings).` });
      continue;
    }
    const rule = SCHEMA_RULES[type];
    if (!rule) {
      findings.push({ severity: 'warning', message: `${label}: unrecognized @type "${type}" -- required properties can't be checked.` });
      continue;
    }
    for (const prop of rule.required) {
      if (!(prop in node)) findings.push({ severity: 'error', message: `${label} (${type}): missing required property "${prop}".` });
    }
    for (const prop of rule.recommended) {
      if (!(prop in node)) findings.push({ severity: 'warning', message: `${label} (${type}): missing recommended property "${prop}".` });
    }
  }

  return findings;
}

export function validateJsonLd(input: string): JsonLdValidationResult {
  if (input.trim() === '') return { ok: false, parseError: 'Enter a JSON-LD block to validate.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, parseError: error instanceof Error ? error.message : 'Invalid JSON.' };
  }

  const findings: JsonLdFinding[] = [];

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as { '@graph'?: unknown })['@graph'])) {
    const graph = (parsed as { '@graph': unknown[] })['@graph'];
    graph.forEach((node, i) => {
      if (node && typeof node === 'object') findings.push(...validateNode(node as Record<string, unknown>, `@graph[${i}]`));
    });
    return { ok: true, findings };
  }

  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  nodes.forEach((node, i) => {
    if (!node || typeof node !== 'object') {
      findings.push({ severity: 'error', message: `Item ${i}: not a JSON object.` });
      return;
    }
    findings.push(...validateNode(node as Record<string, unknown>, nodes.length > 1 ? `Item ${i}` : 'Document'));
  });

  return { ok: true, findings };
}
