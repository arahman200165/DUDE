import { describe, expect, it } from 'vitest';
import { COLLAB_MAX_CONTROL_BYTES, COLLAB_MAX_FRAME_BYTES } from '../hub/collab.schema.js';
import {
  AGENT_METHODS, COLLAB_MAX_FRAME_BASE64_LENGTH, isAgentMethod, isCollabRefusalReason, isCollabRefusalTransient, parseAgentEvent, parseCollabRelayFrame,
} from './agent-protocol.js';

const b64 = (length: number): string => Buffer.alloc(length, 1).toString('base64');

describe('collaboration relay methods', () => {
  it('are part of the closed method table', () => {
    for (const method of ['collab.open', 'collab.send', 'collab.close']) {
      expect(isAgentMethod(method)).toBe(true);
      expect(AGENT_METHODS).toContain(method);
    }
    expect(isAgentMethod('collab.subscribe')).toBe(false);
  });
});

describe('parseCollabRelayFrame', () => {
  it('accepts a control frame and a binary frame and keeps only the known fields', () => {
    expect(parseCollabRelayFrame({ kind: 'control', text: '{"type":"heartbeat"}', extra: 1 })).toEqual({ kind: 'control', text: '{"type":"heartbeat"}' });
    expect(parseCollabRelayFrame({ kind: 'binary', base64: 'AQID', extra: 1 })).toEqual({ kind: 'binary', base64: 'AQID' });
  });

  it('enforces the control cap in bytes, not characters', () => {
    expect(parseCollabRelayFrame({ kind: 'control', text: 'a'.repeat(COLLAB_MAX_CONTROL_BYTES) })).not.toBeNull();
    expect(parseCollabRelayFrame({ kind: 'control', text: 'a'.repeat(COLLAB_MAX_CONTROL_BYTES + 1) })).toBeNull();
    // 2049 two-byte characters are 4098 bytes in 2049 code units.
    expect(parseCollabRelayFrame({ kind: 'control', text: 'é'.repeat(COLLAB_MAX_CONTROL_BYTES / 2 + 1) })).toBeNull();
    expect(parseCollabRelayFrame({ kind: 'control', text: 'é'.repeat(COLLAB_MAX_CONTROL_BYTES / 2) })).not.toBeNull();
    // A surrogate pair is four bytes.
    expect(parseCollabRelayFrame({ kind: 'control', text: '😀'.repeat(COLLAB_MAX_CONTROL_BYTES / 4 + 1) })).toBeNull();
  });

  it('enforces the binary cap on the decoded size', () => {
    expect(COLLAB_MAX_FRAME_BASE64_LENGTH).toBeGreaterThanOrEqual(Math.ceil((COLLAB_MAX_FRAME_BYTES * 4) / 3));
    expect(parseCollabRelayFrame({ kind: 'binary', base64: b64(COLLAB_MAX_FRAME_BYTES) })).not.toBeNull();
    expect(parseCollabRelayFrame({ kind: 'binary', base64: b64(COLLAB_MAX_FRAME_BYTES + 1) })).toBeNull();
    expect(parseCollabRelayFrame({ kind: 'binary', base64: b64(COLLAB_MAX_FRAME_BYTES * 2) })).toBeNull();
  });

  it.each([
    [null], [undefined], ['x'], [[]], [{}], [{ kind: 'text', text: 'x' }], [{ kind: 'control' }], [{ kind: 'control', text: '' }], [{ kind: 'control', text: 1 }],
    [{ kind: 'binary' }], [{ kind: 'binary', base64: '' }], [{ kind: 'binary', base64: 'AQI' }], [{ kind: 'binary', base64: 'A*ID' }], [{ kind: 'binary', base64: 'AQID\n' }],
    [{ kind: 'binary', base64: 5 }], [{ kind: 'binary', text: 'AQID' }],
  ])('rejects %j', (value) => {
    expect(parseCollabRelayFrame(value)).toBeNull();
  });
});

describe('collab refusal reasons', () => {
  it('knows the closed list and which clear by themselves', () => {
    expect(isCollabRefusalReason('needs-reconcile')).toBe(true);
    expect(isCollabRefusalReason('displaced')).toBe(false);
    expect(isCollabRefusalReason(3)).toBe(false);
    expect(isCollabRefusalTransient('hub-offline')).toBe(true);
    expect(isCollabRefusalTransient('first-sync-pending')).toBe(true);
    expect(isCollabRefusalTransient('revoked')).toBe(false);
    expect(isCollabRefusalTransient('unreachable')).toBe(false);
  });
});

describe('parseAgentEvent: collaboration pushes', () => {
  it('accepts a frame push and returns a clean copy', () => {
    expect(parseAgentEvent({ type: 'event', event: 'collab.frame', kind: 'control', text: '{"type":"heartbeat"}', junk: true })).toEqual({
      type: 'event', event: 'collab.frame', kind: 'control', text: '{"type":"heartbeat"}',
    });
    expect(parseAgentEvent({ type: 'event', event: 'collab.frame', kind: 'binary', base64: 'AQID' })).toEqual({ type: 'event', event: 'collab.frame', kind: 'binary', base64: 'AQID' });
  });

  it('drops a frame push that is malformed or over a cap', () => {
    for (const frame of [
      { kind: 'binary', base64: b64(COLLAB_MAX_FRAME_BYTES + 1) }, { kind: 'control', text: 'a'.repeat(COLLAB_MAX_CONTROL_BYTES + 1) },
      { kind: 'binary', base64: 'not base64!' }, { kind: 'other' }, {},
    ]) {
      expect(parseAgentEvent({ type: 'event', event: 'collab.frame', ...frame })).toBeNull();
    }
  });

  it('accepts a state push with its optional fields', () => {
    expect(parseAgentEvent({ type: 'event', event: 'collab.state', state: 'open' })).toEqual({ type: 'event', event: 'collab.state', state: 'open' });
    expect(parseAgentEvent({ type: 'event', event: 'collab.state', state: 'closed', code: 4008, reason: 'incompatible', willRetry: false, junk: 1 })).toEqual({
      type: 'event', event: 'collab.state', state: 'closed', code: 4008, reason: 'incompatible', willRetry: false,
    });
  });

  it.each([
    [{ state: 'half-open' }], [{}], [{ state: 3 }], [{ state: 'closed', code: '4008' }], [{ state: 'closed', code: 1.5 }], [{ state: 'closed', code: -1 }], [{ state: 'closed', code: 70000 }],
    [{ state: 'closed', reason: 4 }], [{ state: 'closed', reason: 'x'.repeat(65) }], [{ state: 'closed', willRetry: 'yes' }],
  ])('drops a state push that is malformed (%j)', (fields) => {
    expect(parseAgentEvent({ type: 'event', event: 'collab.state', ...fields })).toBeNull();
  });

  it('still ignores events it does not know', () => {
    expect(parseAgentEvent({ type: 'event', event: 'collab.nope' })).toBeNull();
    expect(parseAgentEvent({ type: 'response', event: 'collab.frame', kind: 'binary', base64: 'AQID' })).toBeNull();
  });
});
