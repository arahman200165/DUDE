import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ipv6-explorer',
  title: 'IPv6 Explorer',
  description:
    "Shows an IPv6 address's compressed and expanded forms, its classification, and any embedded IPv4 address.",
  category: 'developer',
  keywords: ['ip', 'ipv6', 'explore', 'compress', 'expand', 'network'],
  route: '/tools/ipv6-explorer',
  load: () => import('./ipv6-explorer').then((m) => m.Ipv6Explorer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
