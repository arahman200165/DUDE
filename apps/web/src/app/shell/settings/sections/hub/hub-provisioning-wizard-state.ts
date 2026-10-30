import type { HubProvisioningComponent, HubProvisioningComponentId } from '@dude/contracts/hub';
import type { DesktopProvisionStatus } from '@dude/contracts/shared/models/platform-bridge.model';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { hubErrorText } from './hub-format';

/** Fixed sentences for the Hub provisioning wizard (Milestone 853). Plain text, no markup, and nothing here ever includes a value the owner typed. */

export const PROVISION_ERROR_COPY: Readonly<Record<string, string>> = {
  'elevation-cancelled': 'The Windows administrator prompt was declined. Nothing changed. Start again when you are ready.',
  'elevation-failed': 'Windows could not start the administrator session. Nothing changed. Try again, or run the dude-hub commands on the Hub machine instead.',
  'session-failed': 'The administrator session stopped unexpectedly. Nothing further was changed. Start again to check what is already set up.',
  'no-session': 'The administrator session has ended. Start again; what you already finished is kept.',
  'stale-preview': 'The preview expired or was already used. Nothing was changed. Preview again.',
  refused: 'The Hub refused that change. Nothing was changed. Check what you entered, then preview again.',
  busy: 'Another Hub operation is running. Wait a moment, then try again.',
  'not-installed': 'The DUDE Hub is not installed on this computer.',
  'unsupported-platform': 'Setting up the Hub platform from here works only on Windows.',
  'not-enrolled': 'This desktop is not connected to a Hub yet, so it cannot do this step.',
  timeout: 'The administrator session did not answer in time. Start again to check what is already set up.',
  'bad-request': 'That request was not accepted. Check what you entered and try again.',
};

export const SESSION_CLOSED_COPY: Readonly<Record<string, string>> = {
  idle: 'The administrator session closed after a period of inactivity. Start again when you are ready; what you already finished is kept.',
  ended: 'The administrator session ended. Start again to continue; what you already finished is kept.',
  cancelled: 'The administrator prompt was declined. Nothing changed.',
  failed: 'The administrator session stopped unexpectedly. Start again to check what is already set up.',
  'window-closed': 'The session closed with the window. Start again to continue.',
};

export const STEP_STATE_TEXT: Readonly<Record<'done' | 'needs-attention' | 'not-configured' | 'optional', string>> = {
  done: 'Already set up. Running this step again is safe.',
  'needs-attention': 'This needs attention.',
  'not-configured': 'Not set up yet.',
  optional: 'Optional.',
};

export const OUTCOME_TEXT: Readonly<Record<'done' | 'skipped' | 'needs-attention' | 'not-run', string>> = {
  done: 'Done',
  skipped: 'Skipped',
  'needs-attention': 'Needs attention',
  'not-run': 'Not run',
};

export const WIZARD_COPY = {
  heading: "Set up this Hub's platform",
  summary: 'Creates the Hub\'s storage and walks you through the Cloudflare tunnel, Google sign-in, backups, power settings and a standby copy. Every step is optional and safe to run again.',
  start: 'Start (Windows will ask for administrator permission once)',
  waiting: 'Waiting for the Windows administrator prompt…',
  stopped: 'Setup stopped. Anything already applied stays as it is.',
  closed: 'Setup closed. Anything already applied stays as it is.',
  restarting: 'The Hub is restarting. It can take about a minute to come back.',
  skip: 'Skip this step',
  tunnelIntro: 'The tunnel lets you reach this Hub from outside your network through Cloudflare. Create a tunnel in Cloudflare Zero Trust first, then paste its connector token here. Turning it on exposes this Hub to the Internet.',
  tunnelPhraseIntro: 'This makes the Hub reachable from the Internet. To confirm, type this phrase exactly:',
  oidcIntro: 'This adds Google as an extra way to sign in. Your password keeps working. In the Google Cloud console, under APIs & Services > Credentials, create an OAuth client of type Web application, then paste its client ID and client secret here.',
  backupIntro: 'Choose a folder on another disk or computer, set a passphrase and how often the Hub backs up.',
  backupWarning: 'The passphrase is NOT stored and cannot be recovered. If you lose it, you lose the backups.',
  powerIntro: 'The Hub cannot serve you while this computer sleeps. This stops sleep and hibernate on AC power. Nothing changes until you confirm.',
  standbyIntro: 'This computer keeps an encrypted copy of the Hub\'s backups, so you can recover if the Hub computer is lost. It only ever receives encrypted files.',
} as const;


/**
 * The pure part of the Hub provisioning wizard (Milestone 853): step ids and order, what each step's status means, the exposure-widening phrase check, the backup
 * passphrase rules, the redirect-origin default and the copy for every error code. Nothing here calls the host or holds a secret.
 */

export type WizardStepId = 'status' | 'tunnel' | 'google' | 'backups' | 'power' | 'standby' | 'finish';

export interface WizardStep {
  readonly id: WizardStepId;
  readonly title: string;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 'status', title: 'Check and create storage' },
  { id: 'tunnel', title: 'Cloudflare Tunnel' },
  { id: 'google', title: 'Google sign-in' },
  { id: 'backups', title: 'Backups' },
  { id: 'power', title: 'Power' },
  { id: 'standby', title: 'Standby copy' },
  { id: 'finish', title: 'Finish' },
];

/** The steps shown on this desktop: the standby step needs the desktop's standby bridge. */
export function stepsFor(standbyAvailable: boolean): readonly WizardStep[] {
  return standbyAvailable ? WIZARD_STEPS : WIZARD_STEPS.filter((s) => s.id !== 'standby');
}

/** `done` is set up, `needs-attention` is set up with a problem or half set up, `not-configured` is not set up yet, `optional` is not derivable from the status. */
export type StepState = 'done' | 'needs-attention' | 'not-configured' | 'optional';

/** What the owner did with a step by the time the wizard finishes. */
export type StepOutcome = 'done' | 'skipped' | 'needs-attention' | 'not-run';

function componentState(status: DesktopProvisionStatus, id: HubProvisioningComponentId): HubProvisioningComponent['state'] | null {
  return status.provisioning.components.find((c) => c.id === id)?.state ?? null;
}

function fromComponent(state: HubProvisioningComponent['state'] | null): StepState {
  switch (state) {
    case 'ready': return 'done';
    case 'degraded':
    case 'needs-attention': return 'needs-attention';
    case 'unavailable': return 'optional';
    case 'not-configured':
    case null: return 'not-configured';
  }
}

/** The state of one step from the Hub's own status; a step the status cannot describe (standby, finish) is `optional`. */
export function stepStateFor(step: WizardStepId, status: DesktopProvisionStatus | null): StepState {
  if (status === null) return 'not-configured';
  switch (step) {
    case 'status': {
      switch (status.provisioning.overall) {
        case 'ready': return 'done';
        case 'not-provisioned': return 'not-configured';
        default: return 'needs-attention';
      }
    }
    case 'tunnel': {
      const t = status.tunnel;
      if (t !== null) {
        if (!t.supported) return 'optional';
        if (t.configured) return t.state === 'ready' && t.tokenPresent ? 'done' : 'needs-attention';
        return 'not-configured';
      }
      return fromComponent(componentState(status, 'tunnel'));
    }
    case 'google': return fromComponent(componentState(status, 'oidc'));
    case 'backups': {
      const b = status.backup;
      if (b === null) return 'not-configured';
      if (!b.configured) return 'not-configured';
      return b.keyPresent && b.destinations > 0 ? 'done' : 'needs-attention';
    }
    case 'power': {
      const p = status.power;
      if (p !== null) {
        if (p.verdict === 'ok' || p.applied) return 'done';
        return p.verdict === null ? fromComponent(componentState(status, 'power')) : 'needs-attention';
      }
      return fromComponent(componentState(status, 'power'));
    }
    case 'standby':
    case 'finish': return 'optional';
  }
}

/** The finish summary: a step skipped but already set up reads as done. */
export function finishOutcome(outcome: StepOutcome | undefined, state: StepState): StepOutcome {
  const o = outcome ?? 'not-run';
  return o === 'skipped' && state === 'done' ? 'done' : o;
}

/**
 * The exposure-widening confirmation: the typed text must equal the Hub's phrase exactly (case, spaces and all). The phrase is never pre-filled
 * or trimmed on the owner's behalf, so a pasted trailing space is refused rather than silently forgiven.
 */
export function canApplyTunnel(typed: string, required: string): boolean {
  return required !== '' && typed === required;
}

export const MIN_BACKUP_PASSPHRASE_LENGTH = 12;

/** Why the pair of passphrase inputs cannot be submitted, or null when they can. */
export function passphraseProblem(passphrase: string, confirm: string): string | null {
  if (passphrase.length < MIN_BACKUP_PASSPHRASE_LENGTH) return `Use at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters.`;
  if (passphrase !== confirm) return 'The two passphrases do not match.';
  return null;
}

export const BACKUP_INTERVALS: readonly { readonly hours: number; readonly label: string }[] = [
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Every 24 hours' },
  { hours: 168, label: 'Every week' },
];
export const DEFAULT_BACKUP_INTERVAL_HOURS = 24;

/** `https://<hostname>` for the Google redirect origin field, or '' when no hostname is known. Only the host part of what was typed is used. */
export function redirectOriginFor(hostname: string | null | undefined): string {
  const raw = (hostname ?? '').trim();
  if (raw === '') return '';
  let host = raw;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).host;
  } catch {
    return '';
  }
  host = host.replace(/\.$/, '').toLowerCase();
  return host === '' ? '' : `https://${host}`;
}

/** Friendly copy for a wizard failure. Known codes get fixed sentences; any other (Hub) code shows the message it came with. Never includes anything the owner typed. */
export function provisionErrorText(error: unknown): string {
  if (error instanceof HubAdminError && PROVISION_ERROR_COPY[error.code] !== undefined) return PROVISION_ERROR_COPY[error.code]!;
  return hubErrorText(error, 'That step did not work. Try again.');
}

/** Codes meaning the preview that an apply would spend is no longer usable. */
export const isPreviewGone = (error: unknown): boolean => error instanceof HubAdminError && (error.code === 'stale-preview' || error.code === 'refused');
/** The Hub's `conflict` (the setting is already in place) as the desktop adapter reports it. */
export const isAlreadySet = (error: unknown): boolean => error instanceof HubAdminError && (error.code === 'conflict' || error.code === 'hub-conflict');

export type SessionClosedReason = 'idle' | 'ended' | 'cancelled' | 'failed' | 'window-closed' | undefined;

/** The plain message shown on the start screen when the session closed without the owner finishing the wizard. */
export function sessionClosedText(reason: SessionClosedReason): string {
  return SESSION_CLOSED_COPY[reason ?? 'ended'] ?? SESSION_CLOSED_COPY['ended']!;
}
