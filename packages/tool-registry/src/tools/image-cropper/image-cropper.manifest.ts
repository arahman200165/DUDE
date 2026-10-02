import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'image-cropper',
    title: 'Image Cropper',
    description: 'Drag-selects a crop area on an uploaded image and exports the cropped region.',
    category: 'documents',
    keywords: ['image', 'crop', 'canvas'],
    route: '/tools/image-cropper',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) the pure crop-rect core: rectFromPoints/scaleRectToNatural/clampCropRect never throw across plausible and wildly out-of-range coordinates, and clampCropRect always keeps the rect within the source image bounds with non-negative size.',
    },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['file'] }
};
