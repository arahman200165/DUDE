import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'password-generator',
  title: 'Password / Passphrase Generator',
  description:
    'Generates a random-character password or a diceware-style passphrase using a CSPRNG.',
  category: 'security',
  keywords: ['password', 'passphrase', 'generator', 'random', 'diceware', 'secure', 'csprng'],
  route: '/tools/password-generator',
  load: () => import('./password-generator').then((m) => m.PasswordGenerator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Crosscheck-tested (fast-check) against independently-built reference charset/wordlist/entropy-formula implementations.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text'] },
};
