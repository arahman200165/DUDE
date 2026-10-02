import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { hubErrorText } from './hub-format';

export const MIN_PASSWORD_LENGTH = 12;

const SETUP_COPY: Readonly<Record<string, string>> = {
  'elevation-cancelled': 'The administrator prompt was declined — nothing changed.',
  'not-installed':
    'The DUDE Hub is not installed on this computer. Re-run the DUDE installer and tick "Also install the DUDE Hub", or run DUDE-Hub-Setup.exe.',
  'already-bootstrapped':
    'This Hub already has an owner. Sign in on the Hub web page, create a pairing string under Settings › Devices, then paste it under "Connect to a Hub" here.',
  'handoff-missing': 'The one-time setup token did not arrive. Nothing was created. Try again.',
  'handoff-expired': 'The one-time setup token expired before it was used. Nothing was created. Try again.',
  busy: 'Another Hub operation is running. Wait a moment, then try again.',
};

const UPDATE_COPY: Readonly<Record<string, string>> = {
  'elevation-cancelled': 'The administrator prompt was declined — nothing changed.',
  'update-failed': 'The Hub update failed. Check that the Hub is running, then try again.',
  'no-update': 'There is no Hub update to install.',
  'unsupported-in-dev': 'Updating the Hub is only available in an installed DUDE build, not a development build.',
  busy: 'Another Hub operation is running. Wait a moment, then try again.',
};

const RECOVER_COPY: Readonly<Record<string, string>> = {
  'not-verified': 'Windows did not confirm it is you, so the password was not changed.',
  'not-trusted': 'This computer is not trusted for owner recovery. Mark it as recovery-trusted under Devices while signed in as the owner.',
  unavailable: 'Owner recovery is not available on this computer right now.',
};

function mapped(copy: Readonly<Record<string, string>>, error: unknown, fallback: string): string {
  if (error instanceof HubAdminError && copy[error.code] !== undefined) return copy[error.code]!;
  return hubErrorText(error, fallback);
}

export const setupErrorText = (error: unknown): string => mapped(SETUP_COPY, error, 'The Hub could not be set up.');
export const updateErrorText = (error: unknown): string => mapped(UPDATE_COPY, error, 'The Hub could not be updated.');
export const recoverErrorText = (error: unknown): string => mapped(RECOVER_COPY, error, 'The owner password could not be reset.');
