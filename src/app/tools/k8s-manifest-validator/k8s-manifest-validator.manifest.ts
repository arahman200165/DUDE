import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'k8s-manifest-validator',
  title: 'Kubernetes Manifest YAML Validator / Formatter',
  shortTitle: 'K8s Manifest Validator',
  description:
    'Validates a Kubernetes manifest for required fields (apiVersion, kind, metadata.name) against a curated common-Kind list, and reformats its YAML.',
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'manifest', 'yaml', 'validate', 'format'],
  route: '/tools/k8s-manifest-validator',
  load: () => import('./k8s-manifest-validator').then((m) => m.K8sManifestValidator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
