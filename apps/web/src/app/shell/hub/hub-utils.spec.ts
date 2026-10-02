import { TestBed } from '@angular/core/testing';
import { HubAdminError } from '../../core/hub/hub-admin.port';
import { RetryCountdown, describeHubError, safeReturnUrl } from './hub-utils';

describe('safeReturnUrl', () => {
  it.each(['/tools/base64', '/settings/security?x=1#a', '/'])('accepts %s', (url) => expect(safeReturnUrl(url)).toBe(url));
  it.each(['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', 'tools', '/a\nb', null, 42])('rejects %s', (url) => expect(safeReturnUrl(url)).toBe('/'));
});

describe('describeHubError', () => {
  it('uses overrides, carries retry-after and hides non-Hub errors', () => {
    expect(describeHubError(new HubAdminError('unauthorized', 'x'), { unauthorized: 'Nope' }).message).toBe('Nope');
    expect(describeHubError(new HubAdminError('locked', 'x', 5000))).toMatchObject({ code: 'locked', retryAfterMs: 5000 });
    expect(describeHubError(new Error('secret detail')).message).not.toContain('secret');
  });
});

describe('RetryCountdown', () => {
  it('counts down to zero', () => {
    vi.useFakeTimers();
    try {
      const countdown = TestBed.runInInjectionContext(() => new RetryCountdown());
      countdown.start(2000);
      expect(countdown.seconds()).toBe(2);
      vi.advanceTimersByTime(2000);
      expect(countdown.seconds()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
