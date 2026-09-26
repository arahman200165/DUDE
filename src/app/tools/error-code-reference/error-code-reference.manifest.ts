import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'error-code-reference',
  title: 'Error Code Reference',
  description:
    'Searchable reference of Windows/Win32/HRESULT, POSIX errno, Linux signals, SQL, TLS alert, and DNS response codes.',
  category: 'developer',
  keywords: [
    'error code',
    'hresult',
    'win32',
    'errno',
    'posix',
    'signal',
    'sqlstate',
    'tls alert',
    'dns rcode',
    'reference',
  ],
  route: '/tools/error-code-reference',
  load: () => import('./error-code-reference').then((m) => m.ErrorCodeReference),
  status: 'stable',
  persistence: { input: 'local', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
