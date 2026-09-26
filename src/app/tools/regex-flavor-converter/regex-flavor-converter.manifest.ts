import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'regex-flavor-converter',
  title: 'Regex Flavor Converter',
  description:
    'Translates a regex pattern between JavaScript, Python, Java, .NET, PCRE, and Go RE2 syntax, flagging constructs the target flavor cannot represent.',
  category: 'developer',
  keywords: [
    'regex',
    'regexp',
    'flavor',
    'convert',
    'pcre',
    'python',
    'java',
    'dotnet',
    'go re2',
    'translate',
  ],
  route: '/tools/regex-flavor-converter',
  load: () => import('./regex-flavor-converter').then((m) => m.RegexFlavorConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
