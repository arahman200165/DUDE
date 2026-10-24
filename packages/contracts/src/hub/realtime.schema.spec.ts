import { describe, expect, it } from 'vitest';
import Value from 'typebox/value';
import { HUB_PROTOCOL_VERSION, HUB_REALTIME_DEPTH_PROTOCOL } from './protocol.js';
import { REALTIME_EVENTS, RealtimeEventData, RealtimeServerMessage, realtimeEventAllowed } from './realtime.schema.js';

describe('realtime contract', () => {
  it('declares a payload schema for every event', () => {
    expect(Object.keys(RealtimeEventData).sort()).toEqual([...REALTIME_EVENTS].sort());
  });

  it('keeps event data open on the wire so older clients tolerate added fields', () => {
    expect(Value.Check(RealtimeServerMessage, { type: 'event', event: 'changes-available', data: { revision: 4, extra: true } })).toBe(true);
    expect(Value.Check(RealtimeEventData['changes-available'], { revision: 4 })).toBe(true);
    expect(Value.Check(RealtimeEventData['device-registry-changed'], { deviceId: 'd', change: 'presence' })).toBe(true);
    expect(Value.Check(RealtimeEventData['device-registry-changed'], { deviceId: 'd', change: 'other' })).toBe(false);
  });

  it('withholds 31J events from sockets that negotiated an older protocol', () => {
    expect(HUB_PROTOCOL_VERSION).toBeGreaterThanOrEqual(HUB_REALTIME_DEPTH_PROTOCOL);
    const depth = ['web-access-changed'] as const;
    expect(realtimeEventAllowed('web-access-changed', 2, depth)).toBe(false);
    expect(realtimeEventAllowed('web-access-changed', 3, depth)).toBe(true);
    expect(realtimeEventAllowed('changes-available', 1, depth)).toBe(true);
  });
});
