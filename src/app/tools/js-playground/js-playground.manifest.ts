import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'js-playground',
  desktopOpen: { extensions: ['.js', '.ts'], inputKey: 'code' },
  title: 'JavaScript Playground',
  shortTitle: 'JS Playground',
  description:
    'Run JavaScript snippets in a network-isolated sandbox with captured console output, uncaught errors, and a hard execution timeout.',
  category: 'developer',
  keywords: [
    'javascript',
    'js',
    'playground',
    'run',
    'execute',
    'console',
    'sandbox',
    'repl',
    'code',
  ],
  route: '/tools/js-playground',
  load: () => import('./js-playground').then((m) => m.JsPlayground),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested (fast-check) for core output shape and invariants.',
  },
  consequenceClass: ['code-execution'],
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  network: { required: false },
  io: { accepts: ['text', 'file'], produces: ['text', 'file'] },
};

