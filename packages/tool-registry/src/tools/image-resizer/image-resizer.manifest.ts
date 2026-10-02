import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'image-resizer',
    title: 'Image Resizer',
    description: 'Resizes an uploaded image to explicit dimensions or a percentage scale, with optional aspect-ratio lock.',
    category: 'documents',
    keywords: ['image', 'resize', 'scale', 'dimensions', 'canvas'],
    route: '/tools/image-resizer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure computeResizedDimensions core across the full option space: never throws, always returns finite integer dimensions (zero only for a non-positive original size), and preserves aspect ratio when locked.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['file'] }
};
