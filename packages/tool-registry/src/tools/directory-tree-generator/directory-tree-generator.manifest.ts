import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'directory-tree-generator',
    title: 'Directory Tree Generator',
    shortTitle: 'Dir Tree',
    description: 'Generate a tree listing of any folder on disk — Unicode/ASCII `tree`, Markdown, JSON, collapsible HTML, Mermaid or PlantUML — honoring .gitignore, depth and filters.',
    category: 'text',
    keywords: ['tree', 'directory tree', 'folder structure', 'tree /f', 'project structure', 'markdown tree', 'mermaid', 'plantuml', 'readme', 'listing'],
    route: '/tools/directory-tree-generator',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    consequenceClass: ['filesystem-write'],
    capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'walks real folders on disk in the desktop fs worker' },
        { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'writes the generated tree into the folder only through a previewed, confirmed plan' },
    ],
    io: { accepts: ['file'], produces: ['text', 'json', 'file'] }
};
