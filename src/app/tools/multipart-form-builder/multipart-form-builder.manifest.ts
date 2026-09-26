import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'multipart-form-builder',
  title: 'Multipart Form Data Builder',
  description:
    'Builds a multipart/form-data request body preview from text fields and attached files, with the matching Content-Type boundary header.',
  category: 'web',
  keywords: ['multipart', 'form-data', 'boundary', 'file upload', 'content-type'],
  route: '/tools/multipart-form-builder',
  load: () => import('./multipart-form-builder').then((m) => m.MultipartFormBuilder),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check) pure core: buildMultipartBody/contentTypeHeader/generateBoundary never throw and always terminate with the closing boundary marker.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['text', 'file'], produces: ['text'] },
};
