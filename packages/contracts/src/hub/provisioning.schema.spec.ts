import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import {
  HUB_PROVISIONING_COMPONENT_IDS, HUB_PROVISIONING_COMPONENT_STATES, HUB_PROVISIONING_DETAIL_MAX, HUB_PROVISIONING_OVERALL, HUB_PROVISIONING_PATH, HubProvisioningResponse,
} from './provisioning.schema.js';

describe('HubProvisioningResponse', () => {
  const at = '2026-10-27T10:00:00.000Z';
  const component = { id: 'content-store', state: 'ready', detail: 'Schema 3, integrity check passed.', checkedAt: at };
  const report = {
    overall: 'ready', checkedAt: at, lastRun: { at, outcome: 'ok' }, components: [component],
    secrets: [{ purpose: 'tunnel.connectorToken', present: false, needsReentry: false }], commands: ['dude-hub provision'],
  };

  it('names the path, the closed component list and the states', () => {
    expect(HUB_PROVISIONING_PATH).toBe('/api/v1/provisioning');
    expect([...HUB_PROVISIONING_COMPONENT_IDS].slice(0, 8)).toEqual(['content-store', 'fts', 'vector', 'blob-store', 'cache', 'queue', 'workers', 'secrets']);
    expect([...HUB_PROVISIONING_COMPONENT_STATES]).toEqual(['ready', 'degraded', 'unavailable', 'not-configured', 'needs-attention']);
    expect([...HUB_PROVISIONING_OVERALL]).toEqual(['not-provisioned', 'needs-provisioning', 'needs-attention', 'degraded', 'ready']);
  });

  it('accepts an empty, a ready and a needs-provisioning report', () => {
    expect(Value.Check(HubProvisioningResponse, { overall: 'not-provisioned', checkedAt: at, lastRun: null, components: [], secrets: [], commands: ['dude-hub provision'] })).toBe(true);
    expect(Value.Check(HubProvisioningResponse, report)).toBe(true);
    expect(Value.Check(HubProvisioningResponse, {
      ...report, overall: 'needs-provisioning', lastRun: null,
      components: [{ ...component, id: 'secrets', state: 'needs-attention', nextAction: 'Enter the secrets again.' }],
      secrets: [{ purpose: 'tunnel.connectorToken', present: false, needsReentry: true }],
    })).toBe(true);
  });

  it('rejects an unknown component, an open state, an extra secret value field and an over-long detail', () => {
    expect(Value.Check(HubProvisioningResponse, { ...report, components: [{ ...component, id: 'redis' }] })).toBe(false);
    expect(Value.Check(HubProvisioningResponse, { ...report, components: [{ ...component, state: 'fine' }] })).toBe(false);
    expect(Value.Check(HubProvisioningResponse, { ...report, overall: 'unknown' })).toBe(false);
    expect(Value.Check(HubProvisioningResponse, { ...report, components: [{ ...component, detail: 'x'.repeat(HUB_PROVISIONING_DETAIL_MAX + 1) }] })).toBe(false);
    expect(Value.Check(HubProvisioningResponse, { ...report, secrets: [{ purpose: 'p', present: true }] })).toBe(false);
  });

  it('adds the provisioning.run audit event to the closed list', () => {
    expect(HUB_AUDIT_EVENTS).toContain('provisioning.run');
  });
});
