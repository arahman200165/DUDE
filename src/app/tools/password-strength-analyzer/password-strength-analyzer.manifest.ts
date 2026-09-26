import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'password-strength-analyzer',
  title: 'Password Strength & Entropy Analyzer',
  shortTitle: 'Password Strength',
  description:
    "Scores a password's entropy and strength, with crack-time estimates and common-pattern warnings.",
  category: 'security',
  keywords: ['password', 'entropy', 'strength', 'security', 'brute force', 'crack time'],
  route: '/tools/password-strength-analyzer',
  load: () => import('./password-strength-analyzer').then((m) => m.PasswordStrengthAnalyzer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Crosscheck-tested (fast-check) against an independently-built reference charset-entropy calculator.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
