import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'html-preview',
    desktopOpen: { extensions: ['.html'], inputKey: 'source' },
    title: 'HTML Preview',
    description: 'Live-render an HTML document — including its own inline <script>/<style> — inside a network-isolated sandbox with captured console output.',
    category: 'developer',
    keywords: ['html', 'preview', 'live', 'sandbox', 'codepen', 'render', 'script', 'execute'],
    route: '/tools/html-preview',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    consequenceClass: ['code-execution'],
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    network: { required: false },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
