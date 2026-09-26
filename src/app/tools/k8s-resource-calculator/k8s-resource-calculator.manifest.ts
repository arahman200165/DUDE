import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'k8s-resource-calculator',
  title: 'Kubernetes Resource Requests Calculator',
  shortTitle: 'K8s Resource Calculator',
  description:
    'Sums container CPU/memory requests and limits across a Pod, Deployment, or other workload manifest.',
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'resources', 'requests', 'limits', 'cpu', 'memory'],
  route: '/tools/k8s-resource-calculator',
  load: () => import('./k8s-resource-calculator').then((m) => m.K8sResourceCalculator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary YAML input for crash safety with fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
