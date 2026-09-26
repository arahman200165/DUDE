import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'file-type-detector',
  title: 'File Signature & Type Detector',
  shortTitle: 'File Type Detector',
  description:
    "Identifies an uploaded file's real format from its magic bytes, disambiguates ZIP-based containers like docx/xlsx/pptx/jar, and flags a mismatch against the declared file extension.",
  category: 'developer',
  keywords: [
    'file type',
    'magic bytes',
    'signature',
    'mime',
    'detector',
    'forensics',
    'docx',
    'zip',
    'container',
  ],
  route: '/tools/file-type-detector',
  load: () => import('./file-type-detector').then((m) => m.FileTypeDetector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json'] },
};
