import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'markdown-workspace',
    desktopOpen: { extensions: ['.md'], inputKey: 'source' },
    capabilities: [
        { kind: 'platform', id: 'collab-relay', web: 'unavailable', note: 'collaborate across networks via a self-hosted relay' },
    ],
    title: 'Advanced Markdown Workspace',
    shortTitle: 'Markdown Workspace',
    description: 'Markdown editor with GFM tables/task lists, front matter, table of contents, synced preview, style presets/custom CSS, and a sandboxed plugin API.',
    category: 'documents',
    keywords: [
        'markdown',
        'gfm',
        'front matter',
        'yaml',
        'toc',
        'table of contents',
        'word count',
        'tables',
        'task list',
        'theme',
        'style',
        'custom css',
        'plugin',
    ],
    route: '/tools/markdown-workspace',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure workspace core: computeStats, applyMarkdownInsertion, extractMarkdownLinks, and buildWorkspaceResult (including malformed YAML front matter) never throw on arbitrary text and keep their output shapes/bounds well-formed.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    network: {
        required: true,
        detail: 'Link Checker: HEAD/GET per link, manual "Check links" button only',
    },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] },
    settingsSection: {
        title: 'Collaboration relay',
        keywords: ['relay', 'relay url', 'collaboration', 'collab', 'websocket', 'host via relay'],
        desktopOnly: true,
        onboarding: true,
        workspaceOverridable: [{ key: 'relayUrl', label: 'Relay URL', type: 'url' }]
    },
    storageMigrations: [{ fromNamespace: 'settings', fromKey: 'relayUrl', toKey: 'relayUrl' }]
};
