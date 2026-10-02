import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'docker-compose-validator',
    title: 'Docker Compose Validator / Viewer',
    description: 'Validates a docker-compose YAML file against a minimal Compose Specification shape and browses it as a tree.',
    category: 'developer',
    keywords: ['docker', 'compose', 'validate', 'yaml', 'container'],
    route: '/tools/docker-compose-validator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary YAML text for crash safety with fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
