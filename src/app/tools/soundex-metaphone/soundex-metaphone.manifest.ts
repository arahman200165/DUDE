import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'soundex-metaphone',
  title: 'Soundex / Metaphone',
  description: 'Computes the Soundex and Metaphone phonetic codes for one or more words.',
  category: 'text',
  keywords: ['soundex', 'metaphone', 'phonetic', 'sounds like', 'pronunciation'],
  route: '/tools/soundex-metaphone',
  load: () => import('./soundex-metaphone').then((m) => m.SoundexMetaphone),
  status: 'stable',
  persistence: { input: 'session' },
  io: { accepts: ['text'], produces: ['table'] },
};
