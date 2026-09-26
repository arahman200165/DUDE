import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'file-entropy-analyzer',
  title: 'File Entropy Analyzer',
  description:
    "Computes an uploaded file's Shannon byte-distribution entropy overall and in sliding windows, to spot packed, encrypted, or compressed regions.",
  category: 'developer',
  keywords: [
    'entropy',
    'shannon entropy',
    'randomness',
    'compressed',
    'encrypted',
    'packed',
    'forensics',
  ],
  route: '/tools/file-entropy-analyzer',
  load: () => import('./file-entropy-analyzer').then((m) => m.FileEntropyAnalyzer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'optional' },
  io: { accepts: ['file'], produces: ['json'] },
};
