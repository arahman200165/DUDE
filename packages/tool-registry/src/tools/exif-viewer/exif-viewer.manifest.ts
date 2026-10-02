import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'exif-viewer',
    title: 'EXIF Viewer / Cleaner',
    description: "Views an image's embedded EXIF metadata, or strips it entirely by re-encoding the image through canvas.",
    category: 'documents',
    keywords: ['exif', 'metadata', 'gps', 'camera', 'privacy', 'strip metadata', 'clean image'],
    route: '/tools/exif-viewer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure exif-format tag/GPS formatter core against arbitrary raw tag records and coordinates: never throws, hides binary/long-array fields, sorts keys, formats GPS to a fixed 6-decimal string.',
    },
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['table', 'file'] }
};
