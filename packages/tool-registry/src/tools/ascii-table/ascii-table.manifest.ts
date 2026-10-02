import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ascii-table',
    title: 'ASCII Table',
    description: 'Searchable reference of the 128 standard ASCII characters, with decimal, hex, octal, and control-code names.',
    category: 'text',
    keywords: ['ascii', 'table', 'reference', 'dec', 'hex', 'oct', 'character', 'control code'],
    route: '/tools/ascii-table',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) against filterAsciiTable: never throws, every returned row is a known entry that genuinely matches the filter, and an empty filter returns all 128 rows.',
    },
    persistence: { input: 'local' },
    io: { accepts: ['text'], produces: ['table'] }
};
