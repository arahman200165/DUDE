import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'lorem-ipsum-generator',
  title: 'Lorem Ipsum & Placeholder Text Generator',
  shortTitle: 'Lorem Ipsum',
  description:
    'Generates classic Lorem Ipsum or faker-based placeholder text, as words, sentences, or paragraphs.',
  category: 'text',
  keywords: ['lorem ipsum', 'placeholder', 'dummy text', 'filler', 'faker', 'generate'],
  route: '/tools/lorem-ipsum-generator',
  load: () => import('./lorem-ipsum-generator').then((m) => m.LoremIpsumGenerator),
  status: 'stable',
  persistence: { preferences: 'local' },
  io: { accepts: ['json'], produces: ['text'] },
};
