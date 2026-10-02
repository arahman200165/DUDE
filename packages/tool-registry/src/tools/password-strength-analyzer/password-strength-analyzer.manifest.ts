import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'password-strength-analyzer',
    title: 'Password Strength & Entropy Analyzer',
    shortTitle: 'Password Strength',
    description: "Scores a password's entropy and strength, with crack-time estimates and common-pattern warnings.",
    category: 'security',
    keywords: ['password', 'entropy', 'strength', 'security', 'brute force', 'crack time'],
    route: '/tools/password-strength-analyzer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Crosscheck-tested (fast-check) against an independently-built reference charset-entropy calculator.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
