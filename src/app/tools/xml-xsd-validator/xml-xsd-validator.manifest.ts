import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'xml-xsd-validator',
  title: 'XML Schema / XSD Validator',
  shortTitle: 'XSD Validator',
  description:
    'Validate XML against an XSD schema, via libxml2 compiled to WebAssembly — no network calls once the runtime is cached.',
  category: 'data',
  keywords: ['xml', 'xsd', 'schema', 'validate', 'libxml2', 'wasm'],
  route: '/tools/xml-xsd-validator',
  load: () => import('./xml-xsd-validator').then((m) => m.XmlXsdValidator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Resolves valid and malformed arbitrary XML and schema text to typed results; examples cover validation outcomes.',
  },
  persistence: { input: 'session', preferences: 'local' },
  fileInput: { key: 'xmlInput', extensions: ['.xml'] },
  execution: { worker: 'none' },
  io: { accepts: ['text', 'file'], produces: ['text'] },
};
