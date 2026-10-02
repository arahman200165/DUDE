import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'image-format-converter',
    title: 'Image Format Converter',
    description: 'Converts an uploaded image between PNG, JPEG, WebP, and AVIF (where the browser supports encoding it).',
    category: 'documents',
    keywords: ['image', 'convert', 'png', 'jpeg', 'webp', 'avif', 'format'],
    route: '/tools/image-format-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure format-mime core: replaceExtension never throws for arbitrary filenames/formats and always ends with the extension matching the requested output format.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['file'] }
};
