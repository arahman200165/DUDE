/** Pure, framework-free kubeconfig parsing/summarizing. Secret-bearing fields are surfaced separately so the UI can redact them by default. */
import { load as loadYaml } from 'js-yaml';

export interface KubeconfigCluster {
  readonly name: string;
  readonly server?: string;
  readonly hasCertificateAuthorityData: boolean;
}

export interface KubeconfigContext {
  readonly name: string;
  readonly cluster?: string;
  readonly user?: string;
  readonly namespace?: string;
}

export interface KubeconfigUser {
  readonly name: string;
  readonly authMethod: string;
  readonly secretFields: Readonly<Record<string, string>>;
}

export interface KubeconfigSummary {
  readonly currentContext?: string;
  readonly clusters: readonly KubeconfigCluster[];
  readonly contexts: readonly KubeconfigContext[];
  readonly users: readonly KubeconfigUser[];
}

export type InspectKubeconfigResult = { readonly ok: true; readonly summary: KubeconfigSummary } | { readonly ok: false; readonly error: string };

const SECRET_FIELDS = ['client-certificate-data', 'client-key-data', 'token', 'password'];

function authMethodFor(user: Record<string, unknown>): string {
  if (typeof user['token'] === 'string') return 'Bearer token';
  if ('client-certificate-data' in user || 'client-certificate' in user) return 'Client certificate';
  if (typeof user['username'] === 'string' && typeof user['password'] === 'string') return 'Basic auth';
  if ('exec' in user) return 'Exec plugin';
  if ('auth-provider' in user) return 'Auth provider plugin';
  return 'Unknown';
}

function asRecordArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export function inspectKubeconfig(text: string): InspectKubeconfigResult {
  if (text.trim() === '') return { ok: false, error: 'Enter a kubeconfig YAML document.' };

  let doc: unknown;
  try {
    doc = loadYaml(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse YAML.' };
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'A kubeconfig must be a YAML mapping at the top level.' };
  }
  const root = doc as Record<string, unknown>;

  const clusters = asRecordArray(root['clusters']).map((entry) => {
    const cluster = (entry['cluster'] ?? {}) as Record<string, unknown>;
    return {
      name: String(entry['name'] ?? ''),
      server: typeof cluster['server'] === 'string' ? cluster['server'] : undefined,
      hasCertificateAuthorityData: 'certificate-authority-data' in cluster,
    };
  });

  const contexts = asRecordArray(root['contexts']).map((entry) => {
    const context = (entry['context'] ?? {}) as Record<string, unknown>;
    return {
      name: String(entry['name'] ?? ''),
      cluster: typeof context['cluster'] === 'string' ? context['cluster'] : undefined,
      user: typeof context['user'] === 'string' ? context['user'] : undefined,
      namespace: typeof context['namespace'] === 'string' ? context['namespace'] : undefined,
    };
  });

  const users = asRecordArray(root['users']).map((entry) => {
    const user = (entry['user'] ?? {}) as Record<string, unknown>;
    const secretFields: Record<string, string> = {};
    for (const field of SECRET_FIELDS) {
      if (typeof user[field] === 'string') secretFields[field] = user[field] as string;
    }
    return { name: String(entry['name'] ?? ''), authMethod: authMethodFor(user), secretFields };
  });

  return {
    ok: true,
    summary: {
      currentContext: typeof root['current-context'] === 'string' ? root['current-context'] : undefined,
      clusters,
      contexts,
      users,
    },
  };
}

/** Shows a short prefix/suffix and the total length instead of the raw secret value. */
export function redactSecret(value: string): string {
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}
