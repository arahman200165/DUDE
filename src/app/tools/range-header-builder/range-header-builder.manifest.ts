import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'range-header-builder',
  title: 'Range Header Builder',
  description:
    'Builds or parses a request Range header (single or multi-range, including open-ended and suffix ranges) and a response Content-Range header.',
  category: 'web',
  keywords: ['range', 'content-range', 'header', 'bytes', 'partial content', '206'],
  route: '/tools/range-header-builder',
  load: () => import('./range-header-builder').then((m) => m.RangeHeaderBuilder),
  status: 'verified',
  verification: {
    vectors: ['RFC 9110 §14.1.2 bytes=0-0,-1; §14.4 Content-Range: bytes 0-499/1234'],
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): Range/Content-Range parse and build functions never throw on arbitrary input, checkRangeWarnings reports at most one warning per range, and buildRangeHeader is empty exactly when no valid range exists.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
