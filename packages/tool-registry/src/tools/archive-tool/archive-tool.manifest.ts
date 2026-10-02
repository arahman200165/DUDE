import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'archive-tool',
    title: 'Archive Creator / Extractor',
    description: 'Creates or extracts ZIP, TAR, and TAR.GZ archives entirely client-side.',
    category: 'encoding',
    keywords: ['archive', 'zip', 'tar', 'tar.gz', 'compress', 'extract', 'unzip'],
    route: '/tools/archive-tool',
    status: 'verified',
    verification: {
        vectors: ['Python zipfile and tarfile golden archives with exact paths and file contents'],
        crossChecked: ['Python 3.13.14 standard-library zipfile and tarfile fixture corpus'],
        propertyTested: true,
        summary: 'Extracts independently generated Python ZIP and USTAR TAR fixtures with exact expected paths and contents; round-trip property-tested (fast-check), with TAR extraction fuzz-tested against arbitrary bytes.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['file'] }
};
