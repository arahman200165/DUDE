import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'secret-detector',
    title: 'Secret Detector',
    description: 'Flags likely credentials and keys in pasted text or config — AWS/GitHub/Slack tokens, PEM private keys, JWTs, generic key=value assignments, and high-entropy strings.',
    category: 'developer',
    keywords: ['secret', 'detect', 'credential', 'api key', 'token', 'entropy'],
    route: '/tools/secret-detector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with generated text up to 5000 chars, asserting it never throws and never takes more than 500ms -- guards against regex catastrophic backtracking.',
    },
    consequenceClass: ['secret-management'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
