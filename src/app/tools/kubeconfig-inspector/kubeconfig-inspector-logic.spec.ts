import fc from 'fast-check';
import { inspectKubeconfig, redactSecret } from './kubeconfig-inspector-logic';

const KUBECONFIG = `
current-context: dev
clusters:
  - name: dev-cluster
    cluster:
      server: https://dev.example.com
      certificate-authority-data: QQ==
contexts:
  - name: dev
    context:
      cluster: dev-cluster
      user: dev-user
      namespace: default
users:
  - name: dev-user
    user:
      token: sometoken1234567890
`;

describe('inspectKubeconfig', () => {
  it('parses clusters, contexts, users, and the current context', () => {
    const result = inspectKubeconfig(KUBECONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.currentContext).toBe('dev');
    expect(result.summary.clusters).toEqual([{ name: 'dev-cluster', server: 'https://dev.example.com', hasCertificateAuthorityData: true }]);
    expect(result.summary.contexts).toEqual([{ name: 'dev', cluster: 'dev-cluster', user: 'dev-user', namespace: 'default' }]);
  });

  it('detects the bearer-token auth method and surfaces the secret field', () => {
    const result = inspectKubeconfig(KUBECONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.users[0].authMethod).toBe('Bearer token');
    expect(result.summary.users[0].secretFields['token']).toBe('sometoken1234567890');
  });

  it('detects client-certificate auth', () => {
    const result = inspectKubeconfig('users:\n  - name: u\n    user:\n      client-certificate-data: QQ==\n      client-key-data: QQ==\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary.users[0].authMethod).toBe('Client certificate');
  });

  it('rejects a non-mapping top-level document', () => {
    expect(inspectKubeconfig('- a\n- b\n').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(inspectKubeconfig('').ok).toBe(false);
  });
});

describe('redactSecret', () => {
  it('masks a short value entirely', () => {
    expect(redactSecret('abc')).toBe('•••');
  });

  it('shows a prefix/suffix and length for a longer value', () => {
    expect(redactSecret('abcdefghijklmnop')).toBe('abcd…mnop (16 chars)');
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws for arbitrary text input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => inspectKubeconfig(input)).not.toThrow();
      }),
    );
  });
});
