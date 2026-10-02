import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'rot-cipher',
    title: 'ROT13 / ROT47 Cipher',
    description: 'Applies the self-inverse ROT13 or ROT47 letter/character rotation cipher.',
    category: 'encoding',
    keywords: ['rot13', 'rot47', 'cipher', 'rotate', 'caesar', 'obfuscate'],
    route: '/tools/rot-cipher',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Self-inverse property and fuzz-tested (fast-check) against arbitrary text, in both ROT13 and ROT47 modes.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
