/** Pure, framework-free Kubernetes manifest YAML validation/formatting — required-field checks against a curated common-Kind list, not the full OpenAPI schema. */
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

const KNOWN_KINDS = new Set([
  'Pod',
  'Deployment',
  'Service',
  'ConfigMap',
  'Secret',
  'Namespace',
  'Ingress',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
  'ReplicaSet',
  'PersistentVolumeClaim',
  'PersistentVolume',
  'ServiceAccount',
  'Role',
  'RoleBinding',
  'ClusterRole',
  'ClusterRoleBinding',
  'HorizontalPodAutoscaler',
  'NetworkPolicy',
]);

export type ParseManifestResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

export function parseK8sManifest(text: string): ParseManifestResult {
  if (text.trim() === '') return { ok: false, error: 'Enter a Kubernetes manifest.' };
  try {
    return { ok: true, value: loadYaml(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse YAML.' };
  }
}

export interface K8sManifestIssue {
  readonly message: string;
}

export type K8sManifestValidationResult =
  | { readonly ok: true; readonly issues: readonly K8sManifestIssue[] }
  | { readonly ok: false; readonly error: string };

export function validateK8sManifest(text: string): K8sManifestValidationResult {
  const parsed = parseK8sManifest(text);
  if (!parsed.ok) return parsed;

  const doc = parsed.value;
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'A Kubernetes manifest must be a YAML mapping at the top level.' };
  }

  const root = doc as Record<string, unknown>;
  const issues: K8sManifestIssue[] = [];

  if (typeof root['apiVersion'] !== 'string' || root['apiVersion'].trim() === '') {
    issues.push({ message: 'Missing required field "apiVersion".' });
  }

  const kind = root['kind'];
  if (typeof kind !== 'string' || kind.trim() === '') {
    issues.push({ message: 'Missing required field "kind".' });
  } else if (!KNOWN_KINDS.has(kind)) {
    issues.push({ message: `"${kind}" is not in this checker's curated list of common Kinds — double-check it's not a typo.` });
  }

  const metadata = root['metadata'];
  if (metadata === undefined || metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    issues.push({ message: 'Missing required field "metadata".' });
  } else if (typeof (metadata as Record<string, unknown>)['name'] !== 'string') {
    issues.push({ message: 'Missing required field "metadata.name".' });
  }

  return { ok: true, issues };
}

export type K8sManifestFormatResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

export function formatK8sManifest(text: string): K8sManifestFormatResult {
  const parsed = parseK8sManifest(text);
  if (!parsed.ok) return parsed;
  return { ok: true, output: dumpYaml(parsed.value) };
}
