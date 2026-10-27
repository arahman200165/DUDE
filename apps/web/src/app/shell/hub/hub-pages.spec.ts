import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HubAdminError } from '../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { CODES, SETUP_TOKEN_VALUE, buttonWithText, fakeHubAdmin, settle, signInResponse, typeInto } from './fake-hub-admin.spec-helper';
import { HubRecoverPage } from './hub-recover-page';
import { HubSetupPage } from './hub-setup-page';
import { HubSignInPage } from './hub-sign-in-page';
import { HUB_NAVIGATE_EXTERNAL } from './hub-utils';

function configure(admin: ReturnType<typeof fakeHubAdmin>, returnUrl?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HUB_ADMIN, useValue: admin },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl === undefined ? {} : { returnUrl }) } } },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { navigate, navigateByUrl };
}

const text = (el: HTMLElement, id: string): string => el.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? '';
const submitButton = (el: HTMLElement): HTMLButtonElement => el.querySelector('[data-testid="submit"]') as HTMLButtonElement;

function acknowledgeCodes(el: HTMLElement, fixture: { detectChanges(): void }): HTMLButtonElement {
  const cont = el.querySelector('[data-testid="codes-continue"]') as HTMLButtonElement;
  expect(cont.disabled).toBe(true);
  const box = el.querySelector('[data-testid="saved-checkbox"]') as HTMLInputElement;
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  fixture.detectChanges();
  expect(cont.disabled).toBe(false);
  return cont;
}

describe('HubSetupPage', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  function fillForm(el: HTMLElement, fixture: { detectChanges(): void }, password = 'correct horse battery') {
    typeInto(el, 'input[name="environment-name"]', 'Home');
    typeInto(el, 'input[name="owner-name"]', 'Ada');
    typeInto(el, 'input[name="new-password"]', password);
    typeInto(el, 'input[name="confirm-password"]', password);
    fixture.detectChanges();
  }

  it('takes the fragment token and strips it from the address bar', async () => {
    history.replaceState(null, '', `/hub/setup#token=${SETUP_TOKEN_VALUE}`);
    configure(fakeHubAdmin());
    const fixture = TestBed.createComponent(HubSetupPage);
    await settle(fixture);
    expect(location.hash).toBe('');
    expect((fixture.nativeElement.querySelector('input[name="setup-token"]') as HTMLInputElement).value).toBe(SETUP_TOKEN_VALUE);
  });

  it('picks up a token from a hash-only navigation and strips it', async () => {
    configure(fakeHubAdmin());
    const fixture = TestBed.createComponent(HubSetupPage);
    await settle(fixture);
    const input = fixture.nativeElement.querySelector('input[name="setup-token"]') as HTMLInputElement;
    expect(input.value).toBe('');
    history.replaceState(null, '', `/hub/setup#token=${SETUP_TOKEN_VALUE}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await settle(fixture);
    expect(location.hash).toBe('');
    expect(input.value).toBe(SETUP_TOKEN_VALUE);
  });

  it('validates the form, shows the codes once and signs in only after they are acknowledged', async () => {
    history.replaceState(null, '', `/hub/setup#token=${SETUP_TOKEN_VALUE}`);
    const admin = fakeHubAdmin();
    const { navigate } = configure(admin);
    const fixture = TestBed.createComponent(HubSetupPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    fillForm(el, fixture, 'short');
    expect(submitButton(el).disabled).toBe(true);
    fillForm(el, fixture);
    expect(submitButton(el).disabled).toBe(false);
    submitButton(el).click();
    await settle(fixture);
    expect(admin.bootstrap).toHaveBeenCalledWith({ setupToken: SETUP_TOKEN_VALUE, environmentName: 'Home', ownerDisplayName: 'Ada', password: 'correct horse battery' });
    expect(el.querySelectorAll('[data-testid="recovery-code"]').length).toBe(10);
    expect(admin.signIn).not.toHaveBeenCalled();
    acknowledgeCodes(el, fixture).click();
    await settle(fixture);
    expect(admin.signIn).toHaveBeenCalledWith('correct horse battery');
    expect(navigate).toHaveBeenCalledWith(['/settings/devices'], { queryParams: { hint: 'pair-desktop' } });
  });

  it.each([
    [new HubAdminError('unauthorized', 'bad'), 'setup token is not valid'],
    [new HubAdminError('conflict', 'done'), 'already set up'],
    [new HubAdminError('bad-request', 'Password is too common'), 'Password is too common'],
    [new HubAdminError('locked', 'locked', 30_000), 'Too many attempts'],
  ])('shows %s', async (error, expected) => {
    history.replaceState(null, '', `/hub/setup#token=${SETUP_TOKEN_VALUE}`);
    const admin = fakeHubAdmin();
    admin.bootstrap.mockRejectedValueOnce(error);
    configure(admin);
    const fixture = TestBed.createComponent(HubSetupPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    fillForm(el, fixture);
    submitButton(el).click();
    await settle(fixture);
    expect(text(el, 'error')).toContain(expected);
    expect(el.querySelector('[data-testid="recovery-code"]')).toBeNull();
    if (error.code === 'conflict') expect(el.querySelector('a[href="/hub/sign-in"]')).not.toBeNull();
    if (error.code === 'locked') {
      expect(text(el, 'error')).toContain('30 s');
      expect(submitButton(el).disabled).toBe(true);
    }
  });
});

describe('HubSignInPage', () => {
  async function signIn(returnUrl?: string, admin = fakeHubAdmin()) {
    const nav = configure(admin, returnUrl);
    const fixture = TestBed.createComponent(HubSignInPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    typeInto(el, 'input[name="password"]', 'hunter2hunter2');
    fixture.detectChanges();
    submitButton(el).click();
    await settle(fixture);
    return { admin, el, ...nav };
  }

  it('signs in and follows a same-app returnUrl', async () => {
    const { admin, navigateByUrl } = await signIn('/settings/security');
    expect(admin.signIn).toHaveBeenCalledWith('hunter2hunter2');
    expect(navigateByUrl).toHaveBeenCalledWith('/settings/security');
  });

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example'])('ignores an unsafe returnUrl %s', async (url) => {
    const { navigateByUrl } = await signIn(url);
    expect(navigateByUrl).toHaveBeenLastCalledWith('/');
  });

  it('goes home without a returnUrl', async () => {
    const { navigateByUrl } = await signIn();
    expect(navigateByUrl).toHaveBeenLastCalledWith('/');
  });

  it('shows a wrong-password error', async () => {
    const admin = fakeHubAdmin();
    admin.signIn.mockRejectedValueOnce(new HubAdminError('unauthorized', 'x'));
    const bad = await signIn(undefined, admin);
    expect(text(bad.el, 'error')).toContain('not correct');
  });

  it('clears the password on a wrong-password response', async () => {
    const admin = fakeHubAdmin();
    admin.signIn.mockRejectedValueOnce(new HubAdminError('unauthorized', 'x'));
    const bad = await signIn(undefined, admin);
    expect((bad.el.querySelector('input[name="password"]') as HTMLInputElement).value).toBe('');
  });

  it.each(['rate-limited', 'locked', 'network'] as const)('keeps the password on a %s response', async (code) => {
    const admin = fakeHubAdmin();
    admin.signIn.mockRejectedValueOnce(new HubAdminError(code, 'x', 5_000));
    const res = await signIn(undefined, admin);
    expect((res.el.querySelector('input[name="password"]') as HTMLInputElement).value).toBe('hunter2hunter2');
  });

  it('shows a lock countdown and disables submit', async () => {
    const admin = fakeHubAdmin();
    admin.signIn.mockRejectedValueOnce(new HubAdminError('locked', 'x', 12_000));
    const res = await signIn(undefined, admin);
    expect(text(res.el, 'error')).toContain('12 s');
    expect(submitButton(res.el).disabled).toBe(true);
  });

  describe('Google sign-in (Milestone 842)', () => {
    const withGoogle = async (options: { query?: Record<string, string>; enabled?: boolean; prepare?: (admin: ReturnType<typeof fakeHubAdmin>) => void } = {}) => {
      const admin = fakeHubAdmin();
      admin.oidcStatus.mockResolvedValue({ configured: true, enabled: options.enabled ?? true });
      options.prepare?.(admin);
      const navigateExternal = vi.fn(() => true);
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]), { provide: HUB_ADMIN, useValue: admin }, { provide: HUB_NAVIGATE_EXTERNAL, useValue: navigateExternal },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) } } },
        ],
      });
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const fixture = TestBed.createComponent(HubSignInPage);
      await settle(fixture);
      return { fixture, el: fixture.nativeElement as HTMLElement, admin, navigateExternal };
    };
    const google = (el: HTMLElement) => el.querySelector('[data-testid="google-continue"]') as HTMLButtonElement | null;

    it('keeps the password form as the only way in when Google is off (and on the Pages companion, where the port has no Google at all)', async () => {
      const off = await withGoogle({ enabled: false });
      expect(google(off.el)).toBeNull();
      expect(off.el.querySelector('input[name="password"]')).not.toBeNull();
    });

    it('offers Google first, with the password and recovery under "Other ways to sign in"', async () => {
      const { fixture, el } = await withGoogle();
      expect(google(el)?.textContent?.trim()).toBe('Continue with Google');
      expect(el.querySelector('input[name="password"]')).toBeNull(); // collapsed
      const toggle = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Other ways to sign in')) as HTMLButtonElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      toggle.click();
      fixture.detectChanges();
      expect(el.querySelector('input[name="password"]')).not.toBeNull();
      expect(el.querySelector('a[href="/hub/recover"]')).not.toBeNull();
    });

    it('Continue with Google asks the Hub for the URL with the safe return path and leaves for it', async () => {
      const { fixture, el, admin, navigateExternal } = await withGoogle({ query: { returnUrl: '/settings/security' } });
      admin.oidcSignInStart.mockResolvedValue({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', expiresAt: 'x' });
      google(el)!.click();
      await settle(fixture);
      expect(admin.oidcSignInStart).toHaveBeenCalledWith('/settings/security');
      expect(navigateExternal).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    });

    it('an unreachable Google explains itself, opens the password form and keeps the page usable', async () => {
      const { fixture, el, admin, navigateExternal } = await withGoogle();
      admin.oidcSignInStart.mockRejectedValue(new HubAdminError('oidc-unavailable', 'x'));
      google(el)!.click();
      await settle(fixture);
      expect(navigateExternal).not.toHaveBeenCalled();
      expect(text(el, 'google-notice')).toContain('password');
      expect(el.querySelector('input[name="password"]')).not.toBeNull();
      expect(google(el)!.disabled).toBe(false);
    });

    it.each([['failed', 'did not complete'], ['unavailable', 'not available'], ['locked', 'Too many']])('shows the %s outcome of a returned Google attempt and opens the password form', async (value, expected) => {
      const { el } = await withGoogle({ query: { oidc: value } });
      expect(text(el, 'google-notice')).toContain(expected);
      expect(el.querySelector('input[name="password"]')).not.toBeNull();
    });

    it('ignores any other ?oidc= value (nothing from the address bar is rendered)', async () => {
      const { el } = await withGoogle({ query: { oidc: '<img src=x onerror=alert(1)>' } });
      expect(el.querySelector('[data-testid="google-notice"]')).toBeNull();
    });

    it('still shows the outcome when Google has become unavailable (the password form is the only form)', async () => {
      const { el } = await withGoogle({ enabled: false, query: { oidc: 'unavailable' } });
      expect(text(el, 'google-notice')).toContain('not available');
      expect(el.querySelector('input[name="password"]')).not.toBeNull();
    });
  });

  it('redirects to setup when the Hub is not bootstrapped', async () => {
    const admin = fakeHubAdmin();
    admin.probeLocal.mockResolvedValueOnce({ found: true, port: 1, hubInstanceId: 'h', hubVersion: '1', bootstrapped: false });
    const nav = configure(admin);
    const fixture = TestBed.createComponent(HubSignInPage);
    await settle(fixture);
    expect(nav.navigateByUrl).toHaveBeenCalledWith('/hub/setup');
  });
});

describe('HubRecoverPage', () => {
  function fill(el: HTMLElement, fixture: { detectChanges(): void }, secretSelector: string, secret: string) {
    typeInto(el, secretSelector, secret);
    typeInto(el, 'input[name="new-password"]', 'a brand new password');
    fixture.detectChanges();
  }

  it('recovers with a recovery code and warns when few codes remain', async () => {
    const admin = fakeHubAdmin();
    admin.recover.mockResolvedValueOnce(signInResponse(1));
    configure(admin);
    const fixture = TestBed.createComponent(HubRecoverPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    fill(el, fixture, 'input[name="recovery-code"]', 'abcde-12345');
    submitButton(el).click();
    await settle(fixture);
    expect(admin.recover).toHaveBeenCalledWith('ABCDE-12345', 'a brand new password');
    expect(text(el, 'remaining-warning')).toContain('Only 1 recovery code is left');
  });

  it('goes home directly when plenty of codes remain', async () => {
    const admin = fakeHubAdmin();
    const { navigateByUrl } = configure(admin);
    const fixture = TestBed.createComponent(HubRecoverPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    fill(el, fixture, 'input[name="recovery-code"]', 'ABCDE-12345');
    submitButton(el).click();
    await settle(fixture);
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('reports a bad recovery code, then a lock countdown', async () => {
    const admin = fakeHubAdmin();
    admin.recover.mockRejectedValueOnce(new HubAdminError('unauthorized', 'x'));
    configure(admin);
    const fixture = TestBed.createComponent(HubRecoverPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    fill(el, fixture, 'input[name="recovery-code"]', 'ABCDE-12345');
    submitButton(el).click();
    await settle(fixture);
    expect(text(el, 'error')).toContain('not valid or was already used');
    admin.recover.mockRejectedValueOnce(new HubAdminError('locked', 'x', 9000));
    submitButton(el).click();
    await settle(fixture);
    expect(text(el, 'error')).toContain('9 s');
  });

  it('uses a reset token, gates the new codes behind the saved checkbox, then signs in', async () => {
    const admin = fakeHubAdmin();
    const { navigateByUrl } = configure(admin);
    const fixture = TestBed.createComponent(HubRecoverPage);
    const el = fixture.nativeElement as HTMLElement;
    await settle(fixture);
    buttonWithText(el, 'Reset token').click();
    await settle(fixture);
    fill(el, fixture, 'input[name="reset-token"]', SETUP_TOKEN_VALUE);
    submitButton(el).click();
    await settle(fixture);
    expect(admin.ownerReset).toHaveBeenCalledWith(SETUP_TOKEN_VALUE, 'a brand new password');
    expect(el.querySelectorAll('[data-testid="recovery-code"]').length).toBe(CODES.length);
    expect(admin.signIn).not.toHaveBeenCalled();
    acknowledgeCodes(el, fixture).click();
    await settle(fixture);
    expect(admin.signIn).toHaveBeenCalledWith('a brand new password');
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});
