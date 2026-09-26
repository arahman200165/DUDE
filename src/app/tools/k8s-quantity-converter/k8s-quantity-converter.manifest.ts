import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'k8s-quantity-converter',
  title: 'Kubernetes Quantity Converter',
  shortTitle: 'K8s Quantity Converter',
  description:
    'Converts a Kubernetes resource quantity (e.g. "500m", "1Gi") to its canonical value and every other common unit at once.',
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'quantity', 'resource', 'convert', 'cpu', 'memory'],
  route: '/tools/k8s-quantity-converter',
  load: () => import('./k8s-quantity-converter').then((m) => m.K8sQuantityConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table'] },
};
