import { PaletteCommand } from '../../shared/models/command-source.model';
import { searchCommands } from './command-search';

const command = (id: string, title: string, kind: PaletteCommand['kind'], extras: Partial<PaletteCommand> = {}): PaletteCommand => ({
  id, title, kind, execute: () => undefined, ...extras,
});

const fixtures = [
  command('tool-json', 'JSON Formatter', 'tool', { category: 'data', keywords: ['pretty'] }),
  command('pipeline-json', 'Format JSON pipeline', 'pipeline'),
  command('project-one', 'My Project', 'project', { description: 'JSON work' }),
];

describe('searchCommands', () => {
  it('keeps source order for an empty query', () => {
    expect(searchCommands(fixtures, '  ')).toEqual(fixtures);
  });

  it('ranks exact and prefix titles above description and keyword matches', () => {
    const matches = searchCommands([
      command('keyword', 'Something', 'tool', { keywords: ['json'] }),
      command('description', 'Other', 'project', { description: 'A JSON task' }),
      command('prefix', 'JSON Format', 'pipeline'),
      command('exact', 'JSON', 'tool'),
    ], 'json');
    expect(matches.map(({ id }) => id)).toEqual(['exact', 'prefix', 'description', 'keyword']);
  });

  it('searches category and kind labels after content matches', () => {
    expect(searchCommands(fixtures, 'data').map(({ id }) => id)).toEqual(['tool-json']);
    expect(searchCommands(fixtures, 'projects').map(({ id }) => id)).toEqual(['project-one']);
  });

  it('breaks same-tier ties by kind priority, then source order', () => {
    const matches = searchCommands([
      command('project', 'Find JSON', 'project'),
      command('tool-1', 'Find JSON', 'tool'),
      command('tool-2', 'Find JSON', 'tool'),
    ], 'find');
    expect(matches.map(({ id }) => id)).toEqual(['tool-1', 'tool-2', 'project']);
  });

  it('excludes unrelated commands', () => {
    expect(searchCommands(fixtures, 'unrelated')).toEqual([]);
  });
});
