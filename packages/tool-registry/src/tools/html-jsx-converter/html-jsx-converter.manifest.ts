import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'html-jsx-converter',
    title: 'HTML ↔ JSX Converter',
    description: 'Converts HTML to JSX (className, htmlFor, style objects, self-closing void tags) or JSX back to HTML, best-effort.',
    category: 'developer',
    keywords: ['html to jsx', 'jsx to html', 'react', 'className', 'htmlFor', 'jsx converter'],
    route: '/tools/html-jsx-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'DOM-backed properties verify generated HTML class attributes become JSX className with text preserved; both directions are fuzzed for typed results.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.html', '.htm', '.jsx', '.tsx'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
