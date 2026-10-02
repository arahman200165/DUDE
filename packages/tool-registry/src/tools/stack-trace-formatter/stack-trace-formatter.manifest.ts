import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'stack-trace-formatter',
    title: 'Stack Trace Formatter',
    description: 'Auto-detects and cleans up a Java, .NET, JavaScript, or Python stack trace, tagging library frames and Caused-by/inner-exception chains.',
    category: 'developer',
    keywords: [
        'stack trace',
        'exception',
        'error',
        'java',
        'dotnet',
        '.net',
        'javascript',
        'python',
        'traceback',
        'debug',
    ],
    route: '/tools/stack-trace-formatter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested line preservation for explicit parsers and auto-detection on arbitrary text.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.log'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
