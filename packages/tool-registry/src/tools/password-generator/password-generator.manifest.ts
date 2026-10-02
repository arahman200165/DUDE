import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'password-generator',
    title: 'Password / Passphrase Generator',
    description: 'Generates a random-character password or a diceware-style passphrase using a CSPRNG.',
    category: 'security',
    keywords: ['password', 'passphrase', 'generator', 'random', 'diceware', 'secure', 'csprng'],
    route: '/tools/password-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Crosscheck-tested (fast-check) against independently-built reference charset/wordlist/entropy-formula implementations.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['json'], produces: ['text'] }
};
