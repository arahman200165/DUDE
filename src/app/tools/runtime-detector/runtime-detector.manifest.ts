import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'runtime-detector',
  title: 'Runtime Detector',
  description:
    'Find every installed developer runtime (Git, Node, Python, Java, .NET, Go, Rust, Docker and more) from PATH, known folders and the registry, see where each lives and which version manager shims it, and spot version conflicts. Live version probes run only when you preview and confirm them.',
  category: 'developer',
  keywords: ['runtime', 'node', 'python', 'java', 'dotnet', '.net', 'go', 'rust', 'docker', 'git', 'version', 'which', 'JAVA_HOME', 'nvm', 'pyenv', 'volta', 'developer environment', 'conflict', 'installed', 'sdk', 'windows'],
  route: '/tools/runtime-detector',
  load: () => import('./runtime-detector').then((m) => m.RuntimeDetectorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads PATH, registry install keys and executable file versions through the desktop system helper; the optional version probe runs discovered programs on an explicit, previewed action' },
  ],
  consequenceClass: ['code-execution'],
  io: { accepts: ['text'], produces: ['json', 'file'] },
};
