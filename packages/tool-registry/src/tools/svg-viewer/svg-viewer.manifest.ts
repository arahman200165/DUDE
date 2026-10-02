import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'svg-viewer',
    title: 'SVG Viewer / Formatter / Optimizer',
    description: 'Previews SVG markup and formats, minifies, or optimizes it (via SVGO).',
    category: 'documents',
    keywords: ['svg', 'format', 'minify', 'optimize', 'svgo', 'vector'],
    route: '/tools/svg-viewer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure formatSvg/minifySvg/optimizeSvg core against arbitrary strings, truncated valid SVG, and XML-flavored noise: never throws and always returns a well-shaped ok/error result.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'source', extensions: ['.svg'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
