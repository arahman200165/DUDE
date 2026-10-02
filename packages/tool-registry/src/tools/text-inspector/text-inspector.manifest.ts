import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'text-inspector',
    desktopOpen: { extensions: ['.txt'], inputKey: 'text' },
    title: 'Text Inspector',
    description: 'Character, word, line, and byte metrics for any text, plus readability scoring, language detection, and grammar checking.',
    category: 'text',
    keywords: [
        'text',
        'inspector',
        'count',
        'characters',
        'words',
        'lines',
        'bytes',
        'metrics',
        'readability',
        'flesch',
        'language detection',
        'grammar',
    ],
    route: '/tools/text-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): text/readability metrics and language detection (the pure, non-networked logic) never throw and hold their count/shape invariants for arbitrary text.',
    },
    persistence: { input: 'session', preferences: 'none' },
    network: { required: true, detail: 'LanguageTool API' },
    io: { accepts: ['text', 'file'], produces: ['json'] }
};
