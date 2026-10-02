import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'resx-tool',
    title: 'Resx Tool',
    description: 'View, diff, merge, and extract format tokens from .NET .resx resource files.',
    category: 'data',
    keywords: ['resx', '.net', 'resource', 'diff', 'merge', 'localization', 'i18n', 'token'],
    route: '/tools/resx-tool',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with fast-check: arbitrary XML text returns a result without throwing.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['table', 'text'] }
};
