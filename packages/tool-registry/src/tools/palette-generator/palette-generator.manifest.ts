import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'palette-generator',
    title: 'Palette Generator',
    description: 'Generates complementary, analogous, triadic, tetradic, and monochromatic color palettes from a base color.',
    category: 'encoding',
    keywords: [
        'palette',
        'color scheme',
        'complementary',
        'analogous',
        'triadic',
        'tetradic',
        'monochromatic',
        'color palette',
    ],
    route: '/tools/palette-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): generatePalette returns the expected count of well-formed hex colors and is deterministic across every palette type and the full color space; fuzz-tested against arbitrary text input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
