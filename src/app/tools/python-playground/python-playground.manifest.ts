import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'python-playground',
  title: 'Python Playground',
  description:
    'Run Python in the browser via Pyodide (WebAssembly CPython) — no network calls once the runtime is cached.',
  category: 'developer',
  keywords: [
    'python',
    'pyodide',
    'playground',
    'repl',
    'wasm',
    'sandbox',
    'code execution',
    'script',
  ],
  route: '/tools/python-playground',
  load: () => import('./python-playground').then((m) => m.PythonPlayground),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested the pure sandbox-event reducer for transcript and outcome shape.',
  },
  consequenceClass: ['code-execution'],
  persistence: { input: 'user-choice', preferences: 'local' },
  execution: { worker: 'none' },
  network: { required: false },
  io: { accepts: ['text'], produces: ['text'] },
  capabilities: [{ kind: 'runtime', runtime: 'pyodide' }],
};
