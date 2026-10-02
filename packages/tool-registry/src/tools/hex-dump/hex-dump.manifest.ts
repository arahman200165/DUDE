import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'hex-dump',
    title: 'Hex Dump Viewer / Builder',
    description: 'Renders a file as a classic offset/hex/ASCII hex dump, or rebuilds a file from a pasted hex dump.',
    category: 'encoding',
    keywords: ['hex dump', 'hexdump', 'xxd', 'file', 'binary', 'inspect', 'offset'],
    route: '/tools/hex-dump',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip property-tested (fast-check) for arbitrary binary input through formatHexDump/parseHexDump, plus fuzz-tested against arbitrary text input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['file', 'text', 'bytes'], produces: ['text', 'file', 'bytes'] }
};
