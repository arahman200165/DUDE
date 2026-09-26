import { parseDudeDeepLink } from './deep-link.model';

describe('parseDudeDeepLink', () => {
  it('accepts only the declared open and run shapes', () => {
    expect(parseDudeDeepLink('dude://open/tool/json')).toEqual({ action: 'open', target: 'tool', id: 'json' });
    expect(parseDudeDeepLink('dude://open/workspace-template/api-debugging')).toEqual({ action: 'open', target: 'workspace-template', id: 'api-debugging' });
    expect(parseDudeDeepLink('dude://run/pipeline/123e4567-e89b-12d3-a456-426614174000')).toMatchObject({ action: 'run', target: 'pipeline' });
  });

  it('rejects unexpected schemes, paths, query data, and encoded separators', () => {
    for (const raw of [
      'https://open/tool/json', 'dude://open/tool/json?run=1', 'dude://open/tool/a%2Fb',
      'dude://open/tool/../json', 'dude://open/unknown/json', 'dude://run/tool/json',
      `dude://open/tool/${'x'.repeat(101)}`,
    ]) expect(parseDudeDeepLink(raw)).toBeNull();
  });
});
