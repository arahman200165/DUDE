import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'css-specificity-calculator',
    title: 'CSS Specificity Calculator / Comparer',
    shortTitle: 'CSS Specificity',
    description: 'Scores one or more CSS selectors by specificity and ranks them from most to least specific.',
    category: 'developer',
    keywords: ['css', 'specificity', 'selector', 'cascade', 'compare selectors'],
    route: '/tools/css-specificity-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): selector lists split cleanly and arbitrary inputs return valid ranks without throwing.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['json'] }
};
