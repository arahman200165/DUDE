import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'invisible-char-scanner',
    title: 'Invisible / Control / Zero-Width Character Scanner',
    shortTitle: 'Invisible Char Scanner',
    description: 'Scans text for invisible, control, and zero-width characters, lists each occurrence, and strips selected kinds.',
    category: 'text',
    keywords: ['invisible', 'zero-width', 'control character', 'c0', 'c1', 'scan', 'hidden', 'strip'],
    route: '/tools/invisible-char-scanner',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): scanInvisibleChars/stripInvisibleChars never throw, and stripping every kind leaves no invisible characters for scanInvisibleChars to find.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
