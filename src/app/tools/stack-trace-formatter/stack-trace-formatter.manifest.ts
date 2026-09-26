import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'stack-trace-formatter',
  title: 'Stack Trace Formatter',
  description:
    'Auto-detects and cleans up a Java, .NET, JavaScript, or Python stack trace, tagging library frames and Caused-by/inner-exception chains.',
  category: 'developer',
  keywords: [
    'stack trace',
    'exception',
    'error',
    'java',
    'dotnet',
    '.net',
    'javascript',
    'python',
    'traceback',
    'debug',
  ],
  route: '/tools/stack-trace-formatter',
  load: () => import('./stack-trace-formatter').then((m) => m.StackTraceFormatter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
