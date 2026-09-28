import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'directory-tree-generator',
  title: 'Directory Tree Generator',
  shortTitle: 'Dir Tree',
  description:
    'Generate a tree listing of any folder on disk — Unicode/ASCII `tree`, Markdown, JSON, collapsible HTML, Mermaid or PlantUML — honoring .gitignore, depth and filters.',
  category: 'text',
  keywords: ['tree', 'directory tree', 'folder structure', 'tree /f', 'project structure', 'markdown tree', 'mermaid', 'plantuml', 'readme', 'listing'],
  route: '/tools/directory-tree-generator',
  load: () => import('./directory-tree-generator').then((m) => m.DirectoryTreeGeneratorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  consequenceClass: ['filesystem-write'],
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'walks real folders on disk in the desktop fs worker' },
    { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'writes the generated tree into the folder only through a previewed, confirmed plan' },
  ],
  io: { accepts: ['file'], produces: ['text', 'json', 'file'] },
};
