import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'kubeconfig-inspector',
  title: 'kubeconfig Inspector',
  description:
    "Summarizes a kubeconfig's clusters, contexts, and users, redacting credential fields (tokens, client certs/keys, passwords) behind a reveal toggle.",
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'kubeconfig', 'inspect', 'cluster', 'context'],
  route: '/tools/kubeconfig-inspector',
  load: () => import('./kubeconfig-inspector').then((m) => m.KubeconfigInspector),
  status: 'stable',
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
