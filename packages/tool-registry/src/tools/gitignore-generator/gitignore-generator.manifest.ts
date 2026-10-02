import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'gitignore-generator',
    title: 'Gitignore Generator',
    description: 'Combines curated .gitignore templates (Node, Python, Java, .NET, Go, Rust, macOS, Windows, JetBrains, VS Code) into one file.',
    category: 'developer',
    keywords: ['gitignore', 'git', 'generate', 'template', 'ignore'],
    route: '/tools/gitignore-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary template id lists for non-throwing string output.',
    },
    persistence: { input: 'local', preferences: 'local' },
    io: { accepts: ['json'], produces: ['text', 'file'] }
};
