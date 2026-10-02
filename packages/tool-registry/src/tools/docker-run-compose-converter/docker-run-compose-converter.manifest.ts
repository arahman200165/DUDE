import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'docker-run-compose-converter',
    title: 'Docker Run ↔ Compose Converter',
    description: 'Converts a docker run command into a docker-compose service block, or the reverse.',
    category: 'developer',
    keywords: ['docker', 'compose', 'convert', 'run', 'container'],
    route: '/tools/docker-run-compose-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested simple image/port commands and fuzz-tested arbitrary docker run input with fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
