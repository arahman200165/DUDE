import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'escape-unescape-toolkit',
    title: 'Escape / Unescape Toolkit',
    description: 'Escapes or unescapes text for JavaScript, CSS, SQL, POSIX shell, PowerShell, or quoted-printable.',
    category: 'encoding',
    keywords: [
        'escape',
        'unescape',
        'javascript',
        'css',
        'sql',
        'shell',
        'powershell',
        'quoted-printable',
        'quote',
    ],
    route: '/tools/escape-unescape-toolkit',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip and fuzz-tested (fast-check) against arbitrary text across all six escaping syntaxes (JavaScript, CSS, SQL, shell, PowerShell, quoted-printable).',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
