import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'markdown',
    title: 'Markdown Preview',
    description: 'Live side-by-side Markdown editor and sanitized HTML preview, with style presets and custom CSS.',
    category: 'documents',
    keywords: ['markdown', 'md', 'preview', 'render', 'documents', 'theme', 'style', 'custom css'],
    route: '/tools/markdown',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure renderMarkdown core against arbitrary text: never throws, always returns a string, and the DOMPurify pass never lets a raw <script> tag or a javascript: href through.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'source', extensions: ['.md', '.markdown', '.mdown'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
