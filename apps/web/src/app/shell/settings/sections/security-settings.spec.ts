import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HubAdminError } from '../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { PlatformService } from '../../../core/platform/platform.service';
import { fakeHubAdmin, session, settle, typeInto } from '../../hub/fake-hub-admin.spec-helper';
import { SecuritySettings, auditDetailText, auditEventLabel, shortUserAgent } from './security-settings';

async function setup(hostKind: 'desktop' | 'hub-web' = 'hub-web', prepare?: (admin: ReturnType<typeof fakeHubAdmin>) => void) {
  const admin = fakeHubAdmin();
  prepare?.(admin);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: HUB_ADMIN, useValue: admin }, { provide: PlatformService, useValue: { hostKind } }],
  });
  const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SecuritySettings);
  const el = fixture.nativeElement as HTMLElement;
  await settle(fixture);
  return { fixture, el, admin, navigateByUrl };
}

const byId = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);

describe('Security & Sessions helpers', () => {
  it('humanises audit events and details', () => {
    expect(auditEventLabel('owner.sign-in')).toBe('Owner signed in');
    expect(auditEventLabel('something.new')).toBe('something.new');
    expect(auditDetailText({ sessionId: 'abc', count: 2, nested: { a: 1 } })).toBe('sessionId=abc count=2 nested={"a":1}');
    expect(auditDetailText(null)).toBe('');
  });

  it('shortens user agents', () => {
    expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe('Chrome on Windows');
    expect(shortUserAgent(null)).toBe('Unknown client');
  });
});

describe('SecuritySettings', () => {
  it('lists sessions, tags the current one and offers Sign out for it and Revoke for others', async () => {
    const { el } = await setup();
    const rows = el.querySelectorAll('[data-testid="session-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('This session');
    expect(rows[0].querySelector('button')?.textContent?.trim()).toBe('Sign out');
    expect(rows[1].querySelector('button')?.textContent?.trim()).toBe('Revoke');
  });

  it('revokes another session with a single click', async () => {
    const { fixture, el, admin } = await setup();
    (el.querySelectorAll('[data-testid="session-row"]')[1].querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(admin.revokeSession).toHaveBeenCalledWith('bbbbbbbbbbbbbbbb');
  });

  it('signing out of the current session on the Hub web build goes to sign-in', async () => {
    const { fixture, el, admin, navigateByUrl } = await setup();
    (el.querySelectorAll('[data-testid="session-row"]')[0].querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(admin.ownerSignOut).toHaveBeenCalled();
    expect(admin.revokeSession).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/hub/sign-in');
  });

  it('shows remaining recovery codes from the owner session', async () => {
    const { el } = await setup();
    expect(byId(el, 'remaining-codes')?.textContent).toContain('7 of 10');
  });

  it('shows bearer device ids', async () => {
    const { el } = await setup('desktop', (a) => a.listSessions.mockResolvedValue([session({ kind: 'bearer', deviceId: 'dev-9', sessionId: 'cccccccccccccccc' })]));
    expect(el.textContent).toContain('dev-9');
  });

  describe('change password', () => {
    async function submit(error?: HubAdminError) {
      const ctx = await setup('hub-web', (a) => {
        if (error) a.changePassword.mockRejectedValueOnce(error);
      });
      typeInto(ctx.el, 'input[name="current-password"]', 'old password here');
      typeInto(ctx.el, 'input[name="new-password"]', 'a much newer password');
      typeInto(ctx.el, 'input[name="confirm-password"]', 'a much newer password');
      ctx.fixture.detectChanges();
      (byId(ctx.el, 'password-submit') as HTMLButtonElement).click();
      await settle(ctx.fixture);
      return ctx;
    }

    it('is blocked until the policy and confirmation are satisfied', async () => {
      const { fixture, el } = await setup();
      typeInto(el, 'input[name="current-password"]', 'old');
      typeInto(el, 'input[name="new-password"]', 'short');
      typeInto(el, 'input[name="confirm-password"]', 'short');
      fixture.detectChanges();
      expect((byId(el, 'password-submit') as HTMLButtonElement).disabled).toBe(true);
    });

    it('changes the password and clears the fields', async () => {
      const { el, admin } = await submit();
      expect(admin.changePassword).toHaveBeenCalledWith('old password here', 'a much newer password');
      expect(byId(el, 'password-done')).not.toBeNull();
      expect((el.querySelector('input[name="new-password"]') as HTMLInputElement).value).toBe('');
    });

    it('explains a wrong current password', async () => {
      const { el } = await submit(new HubAdminError('unauthorized', 'x'));
      expect(byId(el, 'password-error')?.textContent).toContain('current password is not correct');
    });

    it('shows a retry-after countdown when locked', async () => {
      const { el } = await submit(new HubAdminError('locked', 'x', 20_000));
      expect(byId(el, 'password-error')?.textContent).toContain('20 s');
      expect((byId(el, 'password-submit') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('audit log', () => {
    it('shows an empty state', async () => {
      const { el } = await setup();
      expect(byId(el, 'audit-empty')).not.toBeNull();
    });

    it('renders humanised rows and loads older pages', async () => {
      const event = (seq: number) => ({ seq, at: '2026-10-01T10:00:00Z', actorKind: 'owner', actorId: null, event: 'owner.sign-in', outcome: 'success', ip: '10.0.0.1', detail: { k: 'v' } });
      const { fixture, el, admin } = await setup('hub-web', (a) => {
        a.listAudit.mockResolvedValueOnce({ events: [event(3), event(2)], nextBeforeSeq: 2 });
        a.listAudit.mockResolvedValueOnce({ events: [event(1)], nextBeforeSeq: null });
      });
      expect(el.querySelectorAll('[data-testid="audit-row"]').length).toBe(2);
      expect(el.textContent).toContain('Owner signed in');
      expect(el.textContent).toContain('k=v');
      (byId(el, 'audit-older') as HTMLButtonElement).click();
      await settle(fixture);
      expect(admin.listAudit).toHaveBeenLastCalledWith(2);
      expect(el.querySelectorAll('[data-testid="audit-row"]').length).toBe(3);
      expect(byId(el, 'audit-older')).toBeNull();
    });
  });
});
