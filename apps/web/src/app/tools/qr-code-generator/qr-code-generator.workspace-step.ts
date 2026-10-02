import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'qr-code-generator';
const SESSION_FIELDS = [
  'text',
  'wifiSsid',
  'wifiPassword',
  'contactName',
  'contactPhone',
  'contactEmail',
  'contactOrg',
  'totpSecret',
  'totpIssuer',
  'totpAccount',
] as const;
const LOCAL_FIELDS = ['preset', 'ecLevel', 'wifiSecurity', 'wifiHidden'] as const;

/**
 * `historyEligible` is deliberately omitted — the WiFi and TOTP presets can carry a real WiFi
 * password or a TOTP (2FA) seed, both of which History must never record even though this tool's
 * own author chose `session` policy (fine for in-session tab mirroring) rather than `none`.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const text = readStorageValue<string>(TOOL_ID, 'text', 'session') ?? '';
    if (!text) return undefined;

    const state: Record<string, unknown> = { text };
    for (const key of SESSION_FIELDS) {
      if (key === 'text') continue;
      const value = readStorageValue<string>(TOOL_ID, key, 'session');
      if (value !== undefined) state[key] = value;
    }
    for (const key of LOCAL_FIELDS) {
      const value = readStorageValue<unknown>(TOOL_ID, key, 'local');
      if (value !== undefined) state[key] = value;
    }

    const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    return { state, summary: `QR code: "${preview}"` };
  },

  restore(state): void {
    for (const key of SESSION_FIELDS) {
      if (typeof state[key] === 'string') writeStorageValue(TOOL_ID, key, 'session', state[key]);
    }
    for (const key of LOCAL_FIELDS) {
      if (state[key] !== undefined) writeStorageValue(TOOL_ID, key, 'local', state[key]);
    }
  },
};
