import { Component, DestroyRef, inject, signal } from '@angular/core';
import type { AuditListEvent, ConfirmPreview, SecurityAlert, SessionInfo } from '@dude/contracts/hub';
import { HubAdminError } from '../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';
import { HubWebSignOut } from '../../../core/hub-web/hub-web-sign-out.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { MIN_PASSWORD_LENGTH, RetryCountdown, describeHubError } from '../../hub/hub-utils';
import { RecoveryCodesDisplay } from '../../hub/recovery-codes-display';
import { HubOwnerSession } from './hub/hub-owner-session.service';

/** Human names for the closed `HUB_AUDIT_EVENTS` list; an unknown (newer) event falls back to its raw name. */
export const AUDIT_EVENT_LABELS: Readonly<Record<string, string>> = {
  'hub.started': 'Hub started',
  'hub.bootstrap': 'Hub set up',
  'owner.sign-in': 'Owner signed in',
  'owner.sign-out': 'Owner signed out',
  'owner.password-changed': 'Password changed',
  'owner.recovery-code-used': 'Recovery code used',
  'owner.recovery-codes-regenerated': 'Recovery codes regenerated',
  'owner.reset-local': 'Owner reset from the Hub machine',
  'owner.recovery-device': 'Recovery by a trusted device',
  'session.revoked': 'Session revoked',
  'session.revoked-all': 'All other sessions revoked',
  'pairing.created': 'Pairing code created',
  'device.enrolled': 'Device enrolled',
  'device.renamed': 'Device renamed',
  'device.revoked': 'Device revoked',
  'device.unenrolled': 'Device unenrolled',
  'device.recovery-trust-changed': 'Device recovery trust changed',
  'device.token-issued': 'Device token issued',
  'auth.failure': 'Authentication failed',
  'tls.rotation-staged': 'Certificate rotation staged',
  'tls.rotation-activated': 'Certificate rotation activated',
  'tls.names-changed': 'Certificate names changed',
  'tls.ca-created': 'Local CA created',
  'tls.renewed': 'Certificate renewed',
  'tls.import-staged': 'Imported certificate staged',
  'tls.acme-issued': 'ACME certificate staged',
  'tls.acme-failed': 'ACME certificate request failed',
  'tls.proxy-pin-staged': 'Proxy certificate pin staged',
  'tls.proxy-pin-activated': 'Proxy certificate pin activated',
  'tls.proxy-pin-removed': 'Proxy certificate pin removed',
  'network.mode-changed': 'Network mode changed',
  'network.proxy-changed': 'Reverse proxy changed',
  'network.exposure-mode-changed': 'Exposure mode changed',
  'network.address-changed': 'Hub address changed',
  'throttle.locked': 'Sign-in locked after failures',
  'purge.previewed': 'Purge previewed',
  'purge.applied': 'Purge applied',
  'web.attached': 'Browser attached',
  'web.access-changed': 'Web access changed',
  'hub.diagnostics-viewed': 'Endpoint diagnostics viewed',
  'security.ip-blocked': 'Address blocked',
  'security.ip-unblocked': 'Address unblocked',
  'security.audit-ips-changed': 'Audit address recording changed',
  'owner.step-up': 'Owner confirmed with password',
  'session.rotated': 'Session renewed',
};

export function auditEventLabel(event: string): string {
  return AUDIT_EVENT_LABELS[event] ?? event;
}

/** `{a: 1, b: 'x'}` as `a=1 b=x`; nested values are compacted to JSON and long values are shortened. */
export function auditDetailText(detail: Readonly<Record<string, unknown>> | null): string {
  if (detail === null) return '';
  return Object.entries(detail)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}=${text.length > 48 ? `${text.slice(0, 47)}…` : text}`;
    })
    .join(' ');
}

/** A short "Browser on OS" label from a user agent; falls back to a truncated raw string. */
export function shortUserAgent(userAgent: string | null): string {
  if (userAgent === null || userAgent === '') return 'Unknown client';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Electron\//.test(userAgent) ? 'DUDE desktop' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : null;
  const os = /Windows/.test(userAgent) ? 'Windows' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Mac OS X/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : null;
  if (browser !== null) return os === null ? browser : `${browser} on ${os}`;
  return userAgent.length > 40 ? `${userAgent.slice(0, 39)}…` : userAgent;
}

export function formatHubTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

type RevokeAllState =
  | { readonly type: 'idle' }
  | { readonly type: 'preview'; readonly preview: ConfirmPreview }
  | { readonly type: 'working' };

type CodesState =
  | { readonly type: 'idle' }
  | { readonly type: 'preview'; readonly preview: ConfirmPreview }
  | { readonly type: 'working' }
  | { readonly type: 'show'; readonly codes: readonly string[] };

/**
 * Settings > Security & Sessions. Destructive-Action Contract: "Sign out all other sessions" and "Generate new
 * recovery codes" each PREVIEW first (nothing changes), and only the explicit Confirm applies, with the token
 * the preview returned. Cancel discards the preview. New recovery codes live only in component state.
 */
@Component({
  selector: 'app-security-settings',
  imports: [RecoveryCodesDisplay],
  templateUrl: './security-settings.html',
})
export class SecuritySettings {
  private readonly admin = inject(HUB_ADMIN);
  private readonly platform = inject(PlatformService);
  private readonly webSignOut = inject(HubWebSignOut);
  private readonly ownerSession = inject(HubOwnerSession);

  protected readonly sessions = signal<readonly SessionInfo[]>([]);
  protected readonly sessionsLoaded = signal(false);
  protected readonly sessionsError = signal('');
  protected readonly sessionNotice = signal('');
  protected readonly revokeAll = signal<RevokeAllState>({ type: 'idle' });
  protected readonly revokeAllError = signal('');

  protected readonly remainingCodes = signal<number | null>(null);
  protected readonly codes = signal<CodesState>({ type: 'idle' });
  protected readonly codesError = signal('');

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordBusy = signal(false);
  protected readonly passwordError = signal('');
  protected readonly passwordDone = signal(false);
  protected readonly passwordCountdown = new RetryCountdown();
  protected readonly minPassword = MIN_PASSWORD_LENGTH;

  protected readonly audit = signal<readonly AuditListEvent[]>([]);
  protected readonly auditNext = signal<number | null>(null);
  protected readonly auditLoaded = signal(false);
  protected readonly auditBusy = signal(false);
  protected readonly auditError = signal('');

  protected readonly alerts = signal<readonly SecurityAlert[]>([]);
  protected readonly alertsUnseen = signal(0);
  protected readonly alertsSeenSeq = signal(0);
  protected readonly alertsLoaded = signal(false);
  protected readonly alertsBusy = signal(false);
  protected readonly alertsError = signal('');

  protected readonly auditLabel = auditEventLabel;
  protected readonly auditDetail = auditDetailText;
  protected readonly shortAgent = shortUserAgent;
  protected readonly formatTime = formatHubTime;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.codes.set({ type: 'idle' });
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
    });
    void this.loadSessions();
    void this.loadRemainingCodes();
    void this.loadAudit(true);
    void this.loadAlerts();
  }

  protected async loadAlerts(): Promise<void> {
    try {
      const result = await this.admin.listSecurityAlerts();
      this.alerts.set(result.alerts);
      this.alertsUnseen.set(result.unseen);
      this.alertsSeenSeq.set(result.seenSeq);
      this.alertsError.set('');
    } catch (e) {
      this.alertsError.set(describeHubError(e).message);
    } finally {
      this.alertsLoaded.set(true);
    }
  }

  protected isUnseen(alert: SecurityAlert): boolean {
    return alert.seq > this.alertsSeenSeq();
  }

  protected async markAlertsSeen(): Promise<void> {
    if (this.alertsBusy() || this.alerts().length === 0) return;
    this.alertsBusy.set(true);
    try {
      await this.admin.markSecurityAlertsSeen(Math.max(...this.alerts().map((a) => a.seq)));
      await this.loadAlerts();
    } catch (e) {
      this.alertsError.set(describeHubError(e).message);
    } finally {
      this.alertsBusy.set(false);
    }
  }

  protected async loadSessions(): Promise<void> {
    try {
      this.sessions.set(await this.admin.listSessions());
      this.sessionsError.set('');
    } catch (e) {
      this.sessionsError.set(describeHubError(e).message);
    } finally {
      this.sessionsLoaded.set(true);
    }
  }

  private async loadRemainingCodes(): Promise<void> {
    try {
      this.remainingCodes.set((await this.admin.currentSession()).owner.remainingRecoveryCodes);
    } catch {
      // Only the Hub-served build exposes the owner record; elsewhere the count appears in the regeneration preview.
    }
  }

  protected async revokeSession(session: SessionInfo): Promise<void> {
    this.sessionNotice.set('');
    this.sessionsError.set('');
    try {
      if (session.current) {
        await this.admin.ownerSignOut();
        if (this.platform.hostKind === 'hub-web') {
          await this.webSignOut.completeSignOut();
          return;
        }
        this.ownerSession.markSignedOut();
        this.sessionNotice.set('Signed out.');
      } else {
        await this.admin.revokeSession(session.sessionId);
        this.sessionNotice.set('Session revoked.');
      }
      await this.loadSessions();
    } catch (e) {
      this.sessionsError.set(describeHubError(e).message);
    }
  }

  protected otherSessionCount(): number {
    return this.sessions().filter((s) => !s.current).length;
  }

  protected async startRevokeAll(): Promise<void> {
    this.revokeAllError.set('');
    this.sessionNotice.set('');
    try {
      this.revokeAll.set({ type: 'preview', preview: await this.admin.revokeAllPreview() });
    } catch (e) {
      this.revokeAllError.set(describeHubError(e).message);
    }
  }

  protected revokeAllCount(): number {
    const state = this.revokeAll();
    return state.type === 'preview' ? (state.preview.summary.affectedSessions ?? this.otherSessionCount()) : 0;
  }

  protected cancelRevokeAll(): void {
    this.revokeAll.set({ type: 'idle' });
    this.revokeAllError.set('');
  }

  protected async confirmRevokeAll(): Promise<void> {
    const state = this.revokeAll();
    if (state.type !== 'preview') return;
    const count = this.revokeAllCount();
    this.revokeAll.set({ type: 'working' });
    try {
      await this.admin.revokeAll(state.preview.confirmToken);
      this.revokeAll.set({ type: 'idle' });
      this.sessionNotice.set(`Signed out ${count} other ${count === 1 ? 'session' : 'sessions'}.`);
      await this.loadSessions();
    } catch (e) {
      this.revokeAll.set({ type: 'idle' });
      const code = e instanceof HubAdminError ? e.code : '';
      this.revokeAllError.set(code === 'conflict' ? 'Sessions changed; review again.' : describeHubError(e).message);
      await this.loadSessions();
    }
  }

  protected async startCodes(): Promise<void> {
    this.codesError.set('');
    try {
      const preview = await this.admin.recoveryCodesPreview();
      if (preview.summary.remainingRecoveryCodes !== undefined) this.remainingCodes.set(preview.summary.remainingRecoveryCodes);
      this.codes.set({ type: 'preview', preview });
    } catch (e) {
      this.codesError.set(describeHubError(e).message);
    }
  }

  protected cancelCodes(): void {
    this.codes.set({ type: 'idle' });
    this.codesError.set('');
  }

  protected async confirmCodes(): Promise<void> {
    const state = this.codes();
    if (state.type !== 'preview') return;
    this.codes.set({ type: 'working' });
    try {
      const result = await this.admin.regenerateRecoveryCodes(state.preview.confirmToken);
      this.remainingCodes.set(result.recoveryCodes.length);
      this.codes.set({ type: 'show', codes: result.recoveryCodes });
    } catch (e) {
      this.codes.set({ type: 'idle' });
      const code = e instanceof HubAdminError ? e.code : '';
      this.codesError.set(code === 'conflict' || code === 'unauthorized' ? 'The confirmation expired. Review and try again.' : describeHubError(e).message);
    }
  }

  protected shownCodes(): readonly string[] {
    const state = this.codes();
    return state.type === 'show' ? state.codes : [];
  }

  protected dismissCodes(): void {
    this.codes.set({ type: 'idle' });
  }

  protected passwordValid(): boolean {
    return this.currentPassword() !== '' && this.newPassword().length >= MIN_PASSWORD_LENGTH && this.newPassword() === this.confirmPassword();
  }

  protected async changePassword(): Promise<void> {
    if (!this.passwordValid() || this.passwordBusy() || this.passwordCountdown.seconds() > 0) return;
    this.passwordBusy.set(true);
    this.passwordError.set('');
    this.passwordDone.set(false);
    try {
      await this.admin.changePassword(this.currentPassword(), this.newPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.passwordDone.set(true);
    } catch (e) {
      const d = describeHubError(e, { unauthorized: 'The current password is not correct.', forbidden: 'The current password is not correct.' });
      this.passwordError.set(d.message);
      this.passwordCountdown.start(d.retryAfterMs);
    } finally {
      this.passwordBusy.set(false);
    }
  }

  protected async loadAudit(first: boolean): Promise<void> {
    if (this.auditBusy()) return;
    this.auditBusy.set(true);
    try {
      const page = await this.admin.listAudit(first ? undefined : (this.auditNext() ?? undefined));
      this.audit.set(first ? page.events : [...this.audit(), ...page.events]);
      this.auditNext.set(page.nextBeforeSeq);
      this.auditError.set('');
    } catch (e) {
      this.auditError.set(describeHubError(e).message);
    } finally {
      this.auditBusy.set(false);
      this.auditLoaded.set(true);
    }
  }
}
