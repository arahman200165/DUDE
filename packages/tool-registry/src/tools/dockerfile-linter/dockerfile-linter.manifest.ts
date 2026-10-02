import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'dockerfile-linter',
    title: 'Dockerfile Linter / Formatter',
    description: 'Lints a Dockerfile for common issues (unpinned base image, root user, apt-get cleanup, ADD vs COPY, bad EXPOSE ports) and normalizes instruction casing.',
    category: 'developer',
    keywords: ['docker', 'dockerfile', 'lint', 'format', 'container'],
    route: '/tools/dockerfile-linter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested parsed instruction semantics through formatting and fuzz-tested arbitrary Dockerfile text with fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    // Usually named plain `Dockerfile` (no extension) -- the picker's "All files" option covers it.
    fileInput: { key: 'input', extensions: ['.dockerfile'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
