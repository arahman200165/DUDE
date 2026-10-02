import { formatK8sManifest, validateK8sManifest } from "./k8s-manifest-validator-logic.js";

const VALID_POD = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\nspec:\n  containers: []\n';

describe('validateK8sManifest', () => {
  it('accepts a minimal valid Pod manifest with no issues', () => {
    expect(validateK8sManifest(VALID_POD)).toEqual({ ok: true, issues: [] });
  });

  it('flags a missing apiVersion', () => {
    const result = validateK8sManifest('kind: Pod\nmetadata:\n  name: my-pod\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.message.includes('apiVersion'))).toBe(true);
  });

  it('flags a missing kind', () => {
    const result = validateK8sManifest('apiVersion: v1\nmetadata:\n  name: my-pod\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.message.includes('"kind"'))).toBe(true);
  });

  it('flags an unrecognized kind as a possible typo', () => {
    const result = validateK8sManifest('apiVersion: v1\nkind: Pood\nmetadata:\n  name: my-pod\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.message.includes('typo'))).toBe(true);
  });

  it('flags a missing metadata', () => {
    const result = validateK8sManifest('apiVersion: v1\nkind: Pod\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.message.includes('"metadata"'))).toBe(true);
  });

  it('flags a missing metadata.name', () => {
    const result = validateK8sManifest('apiVersion: v1\nkind: Pod\nmetadata:\n  labels: {}\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.message.includes('metadata.name'))).toBe(true);
  });

  it('rejects a non-mapping top-level document', () => {
    expect(validateK8sManifest('- a\n- b\n').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(validateK8sManifest('').ok).toBe(false);
  });
});

describe('formatK8sManifest', () => {
  it('reformats a manifest', () => {
    const result = formatK8sManifest(VALID_POD);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toContain('apiVersion: v1');
  });

  it('rejects empty input', () => {
    expect(formatK8sManifest('').ok).toBe(false);
  });
});
