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
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
