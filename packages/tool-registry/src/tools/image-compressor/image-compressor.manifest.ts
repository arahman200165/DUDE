import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'image-compressor',
    title: 'Image Compressor',
    description: 'Compresses an uploaded image to JPEG, WebP, or PNG with an adjustable quality level and a before/after size comparison.',
    category: 'documents',
    keywords: ['image', 'compress', 'optimize', 'jpeg', 'webp', 'png', 'file size'],
    route: '/tools/image-compressor',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure computeSavingsPercent core (extracted from the component): never throws, returns null exactly when either size is falsy, and otherwise matches the exact percentage-reduction formula.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['file'] }
};
