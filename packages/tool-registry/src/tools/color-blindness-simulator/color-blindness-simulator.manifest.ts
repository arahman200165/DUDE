import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'color-blindness-simulator',
    title: 'Color Blindness Simulator',
    description: 'Simulates protanopia, deuteranopia, and tritanopia on an uploaded image via a per-pixel canvas transform.',
    category: 'encoding',
    keywords: [
        'color blindness',
        'colour blindness',
        'protanopia',
        'deuteranopia',
        'tritanopia',
        'color vision deficiency',
        'accessibility',
    ],
    route: '/tools/color-blindness-simulator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): the per-pixel RGBA transform preserves buffer length and alpha for arbitrary pixel buffers/deficiency types, and never throws.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['file'] }
};
