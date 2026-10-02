import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ascii-art-generator',
    title: 'ASCII Art Generator / Banner',
    shortTitle: 'ASCII Art',
    description: 'Renders text as an ASCII-art banner, with a choice of FIGlet fonts.',
    category: 'text',
    keywords: ['ascii art', 'banner', 'figlet', 'text art', 'font'],
    route: '/tools/ascii-art-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) against renderAsciiArt: never throws for any curated font, is deterministic for a given text/font, and renders non-blank text as non-empty multi-line output across the whole font list.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
