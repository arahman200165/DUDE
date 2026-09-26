import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'model-generator',
  title: 'Model Generator (JSON → Code)',
  description:
    'Infers a type shape from sample JSON and generates a TypeScript, C#, Java, Kotlin, Swift, Python, Rust, Go, or SQL model.',
  category: 'developer',
  keywords: [
    'model',
    'codegen',
    'generate',
    'typescript',
    'c#',
    'java',
    'kotlin',
    'swift',
    'python',
    'dataclass',
    'rust',
    'go',
    'sql',
    'schema',
    'json to code',
  ],
  route: '/tools/model-generator',
  load: () => import('./model-generator').then((m) => m.ModelGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text'] },
};
