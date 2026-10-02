/** Pure, framework-free Kubernetes manifest diffing: parses two YAML manifests and reuses Advanced Diff's `diffTrees()` for the structural comparison. */
import { diffTrees, type TreeDiffResult } from "../advanced-diff/object-tree-diff.js";
import { parseK8sManifest } from "../k8s-manifest-validator/k8s-manifest-validator-logic.js";

export type K8sManifestDiffResult = { readonly ok: true; readonly diff: TreeDiffResult } | { readonly ok: false; readonly error: string };

export function diffK8sManifests(before: string, after: string): K8sManifestDiffResult {
  const beforeParsed = parseK8sManifest(before);
  if (!beforeParsed.ok) return { ok: false, error: `Before: ${beforeParsed.error}` };

  const afterParsed = parseK8sManifest(after);
  if (!afterParsed.ok) return { ok: false, error: `After: ${afterParsed.error}` };

  for (const [label, value] of [['Before', beforeParsed.value], ['After', afterParsed.value]] as const) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: `${label}: A Kubernetes manifest must be a YAML mapping at the top level.` };
    }
  }

  return { ok: true, diff: diffTrees(beforeParsed.value, afterParsed.value, { ignoreCase: false }) };
}
