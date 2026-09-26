import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'aws-sigv4-inspector',
  title: 'AWS Signature V4 Inspector',
  shortTitle: 'SigV4 Inspector',
  description:
    'Recomputes and verifies an AWS Signature Version 4 signed request, or builds one from scratch.',
  category: 'web',
  keywords: [
    'aws',
    'sigv4',
    'signature version 4',
    'authorization header',
    'canonical request',
    'hmac-sha256',
    'sts',
    's3',
    'access key',
  ],
  route: '/tools/aws-sigv4-inspector',
  load: () => import('./aws-sigv4-inspector').then((m) => m.AwsSigv4Inspector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
