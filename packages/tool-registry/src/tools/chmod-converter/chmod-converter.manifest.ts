import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'chmod-converter',
    title: 'chmod / Unix Permissions Converter',
    description: 'Converts between symbolic (rwxr-xr--) and octal (754) Unix permissions, with a visual owner/group/other checkbox grid and setuid/setgid/sticky bits.',
    category: 'developer',
    keywords: [
        'chmod',
        'permissions',
        'unix',
        'octal',
        'symbolic',
        'setuid',
        'setgid',
        'sticky',
        'rwx',
    ],
    route: '/tools/chmod-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-tripped generated permission bitsets through symbolic chmod notation.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
