import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'html-formatter',
    title: 'HTML Formatter / Minifier',
    description: 'Pretty-prints or minifies HTML by walking the parsed DOM, preserving <pre>/<script>/<style> content verbatim.',
    category: 'developer',
    keywords: ['html', 'formatter', 'minifier', 'pretty print', 'beautify', 'html minify'],
    route: '/tools/html-formatter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'DOM-backed properties verify generated paragraph structure and text survive pretty and minified output reparsing.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.html', '.htm'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
