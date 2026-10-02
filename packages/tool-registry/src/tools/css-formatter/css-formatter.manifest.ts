import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'css-formatter',
    desktopOpen: { extensions: ['.css'], inputKey: 'input' },
    title: 'CSS Formatter / Minifier',
    description: 'Pretty-prints or minifies CSS, comment- and string-aware, including nested at-rules like @media.',
    category: 'developer',
    keywords: ['css', 'formatter', 'minifier', 'pretty print', 'beautify', 'css minify'],
    route: '/tools/css-formatter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested (fast-check): minified CSS is idempotent; arbitrary input returns a typed result.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
