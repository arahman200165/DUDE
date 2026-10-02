import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'sqlite-viewer',
    title: 'SQLite File Viewer',
    description: 'Browse the tables in a SQLite file, read-only, entirely client-side.',
    category: 'data',
    keywords: ['sqlite', 'sql', 'database', 'db', 'inspect', 'browse'],
    route: '/tools/sqlite-viewer',
    status: 'verified',
    verification: {
        crossChecked: ['CPython stdlib sqlite3 (independent SQLite build) writes __fixtures__/golden.sqlite; sql.js (WASM SQLite) reads it back byte-for-byte matching'],
        summary: 'Reads a real SQLite file written by an independently-built SQLite engine (Python stdlib) and matches its exact content; parsing itself delegates to sql.js, a genuine WASM-compiled SQLite, not a hand-rolled parser.',
    },
    persistence: { input: 'none', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['file', 'bytes'], produces: ['table'] },
    capabilities: [{ kind: 'runtime', runtime: 'sqljs' }]
};
