import { diffK8sManifests } from "./k8s-manifest-diff-logic.js";

describe('diffK8sManifests', () => {
  it('reports no differences for identical manifests', () => {
    const manifest = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n';
    const result = diffK8sManifests(manifest, manifest);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('detects a changed field', () => {
    const before = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n';
    const after = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: renamed-pod\n';
    const result = diffK8sManifests(before, after);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.changed).toBe(1);
  });

  it('detects an added field', () => {
    const before = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n';
    const after = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n  namespace: prod\n';
    const result = diffK8sManifests(before, after);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.summary.added).toBe(1);
  });

  it('rejects invalid YAML with a "Before:"/"After:" prefix', () => {
    const result = diffK8sManifests('', 'apiVersion: v1\n');
    expect(result).toEqual({ ok: false, error: 'Before: Enter a Kubernetes manifest.' });
  });
});
