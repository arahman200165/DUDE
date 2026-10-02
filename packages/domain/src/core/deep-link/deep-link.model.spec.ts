import fc from 'fast-check';
import { DudeDeepLink, formatDudeDeepLink, parseDudeDeepLink } from "./deep-link.model.js";

describe('parseDudeDeepLink', () => {
  it('accepts only the declared open and run shapes', () => {
    expect(parseDudeDeepLink('dude://open/tool/json')).toEqual({ action: 'open', target: 'tool', id: 'json' });
    expect(parseDudeDeepLink('dude://open/workspace-template/api-debugging')).toEqual({ action: 'open', target: 'workspace-template', id: 'api-debugging' });
    expect(parseDudeDeepLink('dude://run/pipeline/123e4567-e89b-12d3-a456-426614174000')).toMatchObject({ action: 'run', target: 'pipeline' });
  });

  it('accepts dude://open/settings with an optional section, and nothing more', () => {
    expect(parseDudeDeepLink('dude://open/settings')).toEqual({ action: 'open', target: 'settings' });
    expect(parseDudeDeepLink('dude://open/settings/hotkeys')).toEqual({ action: 'open', target: 'settings', section: 'hotkeys' });
    for (const raw of ['dude://open/settings/', 'dude://open/settings/tools/x', 'dude://run/settings', 'dude://run/settings/ai', 'dude://open/settings?x=1']) {
      expect(parseDudeDeepLink(raw), raw).toBeNull();
    }
  });

  it('rejects unexpected schemes, paths, query data, and encoded separators', () => {
    for (const raw of [
      'https://open/tool/json', 'dude://open/tool/json?run=1', 'dude://open/tool/a%2Fb',
      'dude://open/tool/../json', 'dude://open/unknown/json', 'dude://run/tool/json',
      `dude://open/tool/${'x'.repeat(101)}`,
    ]) expect(parseDudeDeepLink(raw)).toBeNull();
  });
});

describe('formatDudeDeepLink', () => {
  const idArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,100}$/);
  const linkArb: fc.Arbitrary<DudeDeepLink> = fc.oneof(
    fc.record({ action: fc.constant('open' as const), target: fc.constantFrom('tool', 'workspace-template', 'project', 'pipeline'), id: idArb }),
    fc.record({ action: fc.constant('run' as const), target: fc.constantFrom('pipeline', 'quick-run'), id: idArb }),
    fc.record({ action: fc.constant('open' as const), target: fc.constant('settings' as const), section: idArb }),
    fc.constant({ action: 'open' as const, target: 'settings' as const }),
  );

  it('round-trips every well-formed link through the strict parser', () => {
    fc.assert(
      fc.property(linkArb, (link) => {
        const raw = formatDudeDeepLink(link);
        return raw !== null && JSON.stringify(parseDudeDeepLink(raw)) === JSON.stringify(link);
      }),
    );
  });

  it('refuses ids the parser would reject, instead of emitting a link desktop refuses', () => {
    expect(formatDudeDeepLink({ action: 'open', target: 'tool', id: '../json' })).toBeNull();
    expect(formatDudeDeepLink({ action: 'open', target: 'tool', id: 'a/b' })).toBeNull();
    expect(formatDudeDeepLink({ action: 'open', target: 'settings', section: 'tools/x' })).toBeNull();
  });
});
