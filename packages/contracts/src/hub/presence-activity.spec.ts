import { describe, expect, it } from 'vitest';
import Value from 'typebox/value';
import { PRESENCE_DESTINATIONS, activityForUrl, sameActivity } from './presence-activity.js';
import { PresenceActivity } from './presence.schema.js';

describe('activityForUrl', () => {
  const known = new Set(['base64', 'json-formatter']);
  const resolve = (url: string): string | undefined => {
    const id = url.split('/').filter(Boolean)[1];
    return id !== undefined && known.has(id) ? id : undefined;
  };
  const at = (url: string) => activityForUrl(url, resolve);

  it('maps a registered tool route to a tool, ignoring query and fragment', () => {
    expect(at('/tools/base64')).toEqual({ kind: 'tool', id: 'base64' });
    expect(at('/tools/json-formatter?input=abc#top')).toEqual({ kind: 'tool', id: 'json-formatter' });
  });

  it('maps the empty path to Home', () => {
    expect(at('/')).toEqual({ kind: 'destination', id: 'home' });
    expect(at('')).toEqual({ kind: 'destination', id: 'home' });
    expect(at('/?q=1')).toEqual({ kind: 'destination', id: 'home' });
  });

  it('maps every settings URL to settings, including a tool settings page', () => {
    expect(at('/settings')).toEqual({ kind: 'destination', id: 'settings' });
    expect(at('/settings/appearance')).toEqual({ kind: 'destination', id: 'settings' });
    expect(at('/settings/tools/base64')).toEqual({ kind: 'destination', id: 'settings' });
  });

  it('maps a first segment that is a shell destination to that destination', () => {
    expect(at('/tools')).toEqual({ kind: 'destination', id: 'tools' });
    expect(at('/pipelines/new')).toEqual({ kind: 'destination', id: 'pipelines' });
    expect(at('/smart-paste')).toEqual({ kind: 'destination', id: 'smart-paste' });
    for (const id of PRESENCE_DESTINATIONS) if (id !== 'home') expect(at(`/${id}`)).toEqual({ kind: 'destination', id });
  });

  it('shares nothing for an unknown tool, an unknown path or a Hub page', () => {
    expect(at('/tools/not-a-tool')).toBeNull();
    expect(at('/open-link')).toBeNull();
    expect(at('/hub/sign-in')).toBeNull();
    expect(at('/nope/base64')).toBeNull();
  });

  it('only ever produces activities the wire schema accepts', () => {
    for (const url of ['/', '/tools/base64', '/tools', '/settings/appearance', ...PRESENCE_DESTINATIONS.map((id) => `/${id}`)]) {
      const activity = at(url);
      expect(activity).not.toBeNull();
      expect(Value.Check(PresenceActivity, activity)).toBe(true);
    }
  });

  it('compares activities by value', () => {
    expect(sameActivity(null, null)).toBe(true);
    expect(sameActivity({ kind: 'tool', id: 'a' }, { kind: 'tool', id: 'a' })).toBe(true);
    expect(sameActivity({ kind: 'tool', id: 'a' }, { kind: 'destination', id: 'home' })).toBe(false);
    expect(sameActivity({ kind: 'tool', id: 'a' }, null)).toBe(false);
  });
});
