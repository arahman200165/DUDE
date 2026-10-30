import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { HUB_POWER_SETTINGS, HUB_POWER_VERDICTS, HubPowerStatus, POWER_APPLY_ACTION, POWER_CONSEQUENCE_CLASS, POWER_REVERT_ACTION } from './power.schema.js';

const status = { verdict: 'ok', checkedAt: '2026-10-29T10:00:00.000Z', sleepAcMinutes: 0, hibernateAcMinutes: null, sleepStates: ['S3'], applied: true, regressed: false, optedOut: false };

describe('power policy contract', () => {
  it('keeps the closed verdicts, settings, actions and consequence class', () => {
    expect([...HUB_POWER_VERDICTS]).toEqual(['ok', 'needs-change', 'unsupported', 'unknown']);
    expect([...HUB_POWER_SETTINGS]).toEqual(['standby', 'hibernate']);
    expect([POWER_APPLY_ACTION, POWER_REVERT_ACTION]).toEqual(['power.apply', 'power.revert']);
    expect([...POWER_CONSEQUENCE_CLASS]).toEqual(['system-config']);
  });

  it('adds the three audit events', () => {
    for (const event of ['power.changed', 'power.reverted', 'power.regressed']) expect(HUB_AUDIT_EVENTS as readonly string[]).toContain(event);
  });

  it('describes the status', () => {
    expect(Value.Check(HubPowerStatus, status)).toBe(true);
    expect(Value.Check(HubPowerStatus, { ...status, verdict: 'sleepy' })).toBe(false);
    expect(Value.Check(HubPowerStatus, { ...status, sleepAcMinutes: -1 })).toBe(false);
  });
});
