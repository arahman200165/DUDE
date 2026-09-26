import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'k8s-manifest-diff',
  title: 'Kubernetes Manifest Diff',
  shortTitle: 'K8s Manifest Diff',
  description: 'Diffs two Kubernetes manifests, reporting added, removed, and changed fields.',
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'manifest', 'diff', 'compare', 'yaml'],
  route: '/tools/k8s-manifest-diff',
  load: () => import('./k8s-manifest-diff').then((m) => m.K8sManifestDiff),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary YAML manifest pairs; invalid top-level scalars return a typed error.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
