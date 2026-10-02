import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'rich-text-editor',
    title: 'Rich Text Editor',
    shortTitle: 'Rich Text',
    description: 'WYSIWYG editor with sanitized HTML and Markdown export.',
    category: 'documents',
    keywords: [
        'wysiwyg',
        'rich text',
        'editor',
        'html',
        'markdown',
        'tiptap',
        'formatting',
        'word processor',
    ],
    route: '/tools/rich-text-editor',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure sanitizeEditorHtml DOMPurify pass against arbitrary HTML-ish text: never throws, never lets a <script> tag/inline event handler/javascript: URL through, and is idempotent on its own output.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text', 'file'] }
};
