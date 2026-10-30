import { createHash } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import { STANDBY_CONSEQUENCE_CLASS, STANDBY_GRANT_ACTION, STANDBY_REVOKE_ACTION } from '@dude/contracts/hub';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { getDevice } from '../devices/registry.js';
import { grantStandby, listStandbyGrants, revokeStandby, standbyGrantRowAt, standbyIneligibility } from '../standby/grants.js';
import { standbyDefinitions } from '../standby/repositories.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { AdminMethodContext } from './methods.js';

const ADMIN_BINDING = 'cli';
const DEVICE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const INELIGIBLE: Record<string, [string, string]> = {
  'not-found': ['not-found', 'No such device.'],
  'not-desktop': ['bad-request', 'Standby access can only be granted to a paired desktop device.'],
  inactive: ['conflict', 'That device is no longer enrolled.'],
  'needs-re-pair': ['conflict', 'That device must be paired again before it can be granted standby access.'],
};

/**
 * The warm-standby grant (32-SS1, Milestone 849, PD-151): the elevated admin pipe is the ONLY place that grants or revokes it (no HTTP
 * route, no owner session, no device credential can). Both are two-step under the Destructive-Action Contract: the preview changes
 * nothing and stages a single-use 60-second ConfirmationStore token bound to the device and to the grant state it saw (its enrollment
 * time and the current grant row), tagged `authentication` and `database-write`; the apply spends it. Audited as `standby.granted` and
 * `standby.revoked` (actor `cli`, device id only), both in the security alert list. Boundary spec: `standby-methods.confirmation-boundary.spec.ts`.
 *
 * What a grant opens: the device-token standby routes, which serve the stored (encrypted) objects of the `local-folder` backup
 * destinations. Never the master key, the passphrase or plaintext.
 */
export function buildStandbyMethods(context: AdminMethodContext, deps: { now: () => number; confirmations: ConfirmationStore }): Record<string, AdminMethod> {
  const { now, confirmations } = deps;
  const { db } = context;

  const deviceIdOf = (params: unknown): string => {
    const value = (params as { deviceId?: unknown } | null)?.deviceId;
    if (typeof value !== 'string' || !DEVICE_ID.test(value)) throw new AdminError('bad-request', 'Provide the device id as deviceId (see "dude-hub standby list" or the Devices settings).');
    return value;
  };
  const tokenOf = (params: unknown): string => {
    const value = (params as { confirmToken?: unknown } | null)?.confirmToken;
    if (typeof value !== 'string' || value.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
    return value;
  };
  const registeredAt = (deviceId: string): string => getDevice(db, deviceId)?.registeredAt ?? '';
  const digestOf = (action: string, deviceId: string): string =>
    createHash('sha256').update(`${action}\n${deviceId}\n${registeredAt(deviceId)}\n${standbyGrantRowAt(db, deviceId) ?? '-'}`).digest('hex');
  const assertEligible = (deviceId: string): void => {
    const reason = standbyIneligibility(db, deviceId);
    if (reason !== null) throw new AdminError(...(INELIGIBLE[reason]!));
  };
  const repositories = (): number => (context.configFile ? standbyDefinitions(loadOrCreateHubConfig(context.configFile).backup).length : 0);
  const consume = (action: string, deviceId: string, token: string): void => {
    const result = confirmations.consumeDetailed({ token, action, digest: digestOf(action, deviceId), bindingId: ADMIN_BINDING, now: now() });
    if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used. Run the preview again.');
    if (result === 'digest-mismatch') throw new AdminError('conflict', 'The device or its standby grant changed since the preview. Run the preview again.');
  };

  return {
    /** Every grant row with whether it is still effective (a revoked, unenrolled or re-paired device holds none). */
    'standby.list': () => ({ grants: listStandbyGrants(db), repositories: repositories() }),

    'standby.grant.preview': (params) => {
      const deviceId = deviceIdOf(params);
      assertEligible(deviceId);
      const at = now();
      const confirmToken = confirmations.issue({ action: STANDBY_GRANT_ACTION, digest: digestOf(STANDBY_GRANT_ACTION, deviceId), bindingId: ADMIN_BINDING, now: at });
      const device = getDevice(db, deviceId)!;
      return {
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...STANDBY_CONSEQUENCE_CLASS],
        summary: {
          deviceId, displayName: device.displayName, alreadyGranted: listStandbyGrants(db).some((g) => g.deviceId === deviceId && g.active), repositories: repositories(),
          serves: 'The encrypted backup repository objects of the local-folder destinations; the device cannot read them without the backup passphrase.',
        },
      };
    },

    'standby.grant.apply': (params) => {
      const deviceId = deviceIdOf(params);
      const token = tokenOf(params);
      assertEligible(deviceId);
      consume(STANDBY_GRANT_ACTION, deviceId, token);
      return transaction(db, () => {
        const renewed = standbyGrantRowAt(db, deviceId) !== null;
        if (!grantStandby(db, deviceId, now())) throw new AdminError('conflict', 'That device is no longer enrolled.');
        audit(db, { event: 'standby.granted', outcome: 'success', actorKind: 'cli', detail: { deviceId, renewed }, now: now() });
        return { deviceId, granted: true, renewed };
      });
    },

    'standby.revoke.preview': (params) => {
      const deviceId = deviceIdOf(params);
      if (standbyGrantRowAt(db, deviceId) === null) throw new AdminError('not-found', 'That device holds no standby grant.');
      const at = now();
      const confirmToken = confirmations.issue({ action: STANDBY_REVOKE_ACTION, digest: digestOf(STANDBY_REVOKE_ACTION, deviceId), bindingId: ADMIN_BINDING, now: at });
      return {
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...STANDBY_CONSEQUENCE_CLASS],
        summary: { deviceId, displayName: getDevice(db, deviceId)?.displayName ?? null, effect: 'The device stops pulling on its next request. What it already holds stays encrypted on that device.' },
      };
    },

    'standby.revoke.apply': (params) => {
      const deviceId = deviceIdOf(params);
      const token = tokenOf(params);
      if (standbyGrantRowAt(db, deviceId) === null) throw new AdminError('not-found', 'That device holds no standby grant.');
      consume(STANDBY_REVOKE_ACTION, deviceId, token);
      return transaction(db, () => {
        revokeStandby(db, deviceId);
        audit(db, { event: 'standby.revoked', outcome: 'success', actorKind: 'cli', detail: { deviceId }, now: now() });
        return { deviceId, revoked: true };
      });
    },
  };
}
