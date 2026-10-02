import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'contrast-checker',
    title: 'Contrast Checker / WCAG Compliance Checker',
    shortTitle: 'Contrast Checker',
    description: 'Computes the WCAG contrast ratio between two colors and flags AA/AAA pass/fail for text and UI components.',
    category: 'encoding',
    keywords: [
        'contrast',
        'wcag',
        'accessibility',
        'a11y',
        'contrast ratio',
        'aa',
        'aaa',
        'relative luminance',
    ],
    route: '/tools/contrast-checker',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): contrastRatio stays within [1, 21] and is symmetric for arbitrary color pairs; checkContrast fuzz-tested against arbitrary text input.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['json'] }
};
