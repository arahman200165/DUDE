import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cbor-viewer',
  title: 'CBOR Viewer',
  description: 'Decode a CBOR file and inspect its structure.',
  category: 'data',
  keywords: ['cbor', 'decode', 'binary', 'inspect'],
  route: '/tools/cbor-viewer',
  load: () => import('./cbor-viewer').then((m) => m.CborViewer),
  status: 'verified',
  verification: {
    vectors: ['RFC 8949 Appendix A Table 6 integer, array, map, and nested-value encodings'],
    propertyTested: true,
    summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
  },
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['json'] },
};
