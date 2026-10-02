import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'pixel-color-picker',
    title: 'Pixel Color Picker',
    description: 'Reads the exact color of any pixel in an uploaded image.',
    category: 'developer',
    keywords: ['color', 'pixel', 'eyedropper', 'picker', 'image'],
    route: '/tools/pixel-color-picker',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested pure ImageData pixel sampling for channel bounds and out-of-range nulls.',
    },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['json'] }
};
