import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import {
  COLLAB_DOC_ERROR_CODES, COLLAB_HISTORY_MAX_BYTES, COLLAB_HISTORY_MAX_SNAPSHOTS, COLLAB_MAX_CHANNELS, COLLAB_MAX_ROOMS, COLLAB_MAX_ROOM_PARTICIPANTS,
  COLLAB_ROOM_NAME_MAX, COLLAB_DOCUMENT_TITLE_MAX, COLLAB_MAX_CONTROL_BYTES, COLLAB_MAX_FRAME_BYTES, COLLAB_ROOM_IDLE_CLOSE_MS, COLLAB_SNAPSHOT_IDLE_MS,
  COLLAB_SNAPSHOT_MIN_INTERVAL_MS, COLLAB_HISTORY_RETENTION_DAYS, CollabClientControl, CollabHistoryQuery, CollabHistoryResponse, CollabRestoreResponse,
  CollabRoomsResponse, CollabServerControl, CollabSnapshotResponse, CreateCollabRoomRequest, HUB_COLLAB_HISTORY_PATH, HUB_COLLAB_PATH, HUB_COLLAB_ROOMS_PATH,
  KeepCollabRoomRequest, KeepCollabRoomResponse,
} from './collab.schema.js';
import { HUB_REALTIME_PATH } from './realtime.schema.js';

describe('Hub collaboration contract', () => {
  it('names a socket separate from realtime and fixes the PD-100, PD-104 and PD-105 limits', () => {
    expect(HUB_COLLAB_PATH).toBe('/api/v1/collab');
    expect(HUB_COLLAB_PATH).not.toBe(HUB_REALTIME_PATH);
    expect(HUB_COLLAB_ROOMS_PATH).toBe('/api/v1/collab/rooms');
    expect(HUB_COLLAB_HISTORY_PATH).toBe('/api/v1/collab/history');
    expect(COLLAB_MAX_FRAME_BYTES).toBe(1024 * 1024);
    expect(COLLAB_MAX_CONTROL_BYTES).toBe(4096);
    expect([COLLAB_MAX_CHANNELS, COLLAB_MAX_ROOMS, COLLAB_MAX_ROOM_PARTICIPANTS]).toEqual([8, 8, 8]);
    expect(COLLAB_ROOM_IDLE_CLOSE_MS).toBe(300_000);
    expect([COLLAB_HISTORY_MAX_SNAPSHOTS, COLLAB_HISTORY_RETENTION_DAYS, COLLAB_HISTORY_MAX_BYTES]).toEqual([200, 30, 8 * 1024 * 1024]);
    expect([COLLAB_SNAPSHOT_MIN_INTERVAL_MS, COLLAB_SNAPSHOT_IDLE_MS]).toEqual([600_000, 120_000]);
    expect(COLLAB_DOCUMENT_TITLE_MAX).toBe(200);
  });

  it('accepts the client control frames and nothing else', () => {
    expect(Value.Check(CollabClientControl, { type: 'hello', protocolVersion: 3, minHubProtocol: 3 })).toBe(true);
    expect(Value.Check(CollabClientControl, { type: 'subscribe', channel: 1, doc: 'scratchpad:default' })).toBe(true);
    expect(Value.Check(CollabClientControl, { type: 'subscribe', channel: COLLAB_MAX_CHANNELS, doc: 'markdown-doc:0199abcd-ef01' })).toBe(true);
    expect(Value.Check(CollabClientControl, { type: 'subscribe', channel: 2, doc: 'room:r_1' })).toBe(true);
    expect(Value.Check(CollabClientControl, { type: 'unsubscribe', channel: 3 })).toBe(true);
    expect(Value.Check(CollabClientControl, { type: 'heartbeat' })).toBe(true);
    expect(Value.Check(CollabClientControl, { type: 'heartbeat', extra: 1 })).toBe(false);
    expect(Value.Check(CollabClientControl, { type: 'activity' })).toBe(false);
  });

  it('bounds the channel and validates the document key', () => {
    for (const channel of [0, -1, COLLAB_MAX_CHANNELS + 1, 1.5, '1']) {
      expect(Value.Check(CollabClientControl, { type: 'subscribe', channel, doc: 'scratchpad:default' })).toBe(false);
    }
    for (const doc of ['', 'scratchpad', 'scratchpad:', 'pipeline:abc', 'room:a b', 'room:a:b', 'user-script:../x', `markdown-doc:${'a'.repeat(65)}`, 'Room:abc']) {
      expect(Value.Check(CollabClientControl, { type: 'subscribe', channel: 1, doc })).toBe(false);
    }
    expect(Value.Check(CollabClientControl, { type: 'unsubscribe', channel: 0 })).toBe(false);
  });

  it('accepts the server control frames', () => {
    const identity = { deviceId: 'dev-1', name: 'Workstation', colorSlot: 7 };
    const welcome = { type: 'welcome', protocolVersion: 3, sessionKind: 'device', deviceId: 'dev-1', heartbeatIntervalMs: 25_000, identity };
    expect(Value.Check(CollabServerControl, welcome)).toBe(true);
    expect(Value.Check(CollabServerControl, { ...welcome, sessionKind: 'owner-cookie', deviceId: null })).toBe(true);
    expect(Value.Check(CollabServerControl, { ...welcome, identity: { ...identity, colorSlot: 8 } })).toBe(false);
    expect(Value.Check(CollabServerControl, { ...welcome, identity: { ...identity, colorSlot: -1 } })).toBe(false);
    expect(Value.Check(CollabServerControl, { ...welcome, sessionKind: 'guest' })).toBe(false);
    expect(Value.Check(CollabServerControl, { ...welcome, extra: true })).toBe(false);
    expect(Value.Check(CollabServerControl, { type: 'subscribed', channel: 1, doc: 'room:abc' })).toBe(true);
    expect(Value.Check(CollabServerControl, { type: 'error', code: 'rate-limited' })).toBe(true);
  });

  it('closes the doc-error code list', () => {
    expect([...COLLAB_DOC_ERROR_CODES]).toEqual(['consent-required', 'not-found', 'forbidden', 'too-large', 'limit', 'unavailable', 'consent-revoked']);
    for (const code of COLLAB_DOC_ERROR_CODES) expect(Value.Check(CollabServerControl, { type: 'doc-error', channel: 2, code })).toBe(true);
    expect(Value.Check(CollabServerControl, { type: 'doc-error', channel: 2, code: 'consent-revoked', message: 'Collaboration was turned off.' })).toBe(true);
    expect(Value.Check(CollabServerControl, { type: 'doc-error', channel: 2, code: 'boom' })).toBe(false);
    expect(Value.Check(CollabServerControl, { type: 'doc-error', code: 'forbidden' })).toBe(false);
  });

  it('validates the room routes', () => {
    const room = { id: 'r1', name: 'Design notes', participants: 2, createdAt: '2026-10-24T10:00:00.000Z' };
    expect(Value.Check(CollabRoomsResponse, { rooms: [room] })).toBe(true);
    expect(Value.Check(CollabRoomsResponse, { rooms: [] })).toBe(true);
    expect(Value.Check(CollabRoomsResponse, { rooms: [{ ...room, participants: COLLAB_MAX_ROOM_PARTICIPANTS + 1 }] })).toBe(false);
    expect(Value.Check(CollabRoomsResponse, { rooms: Array.from({ length: COLLAB_MAX_ROOMS + 1 }, () => room) })).toBe(false);
    expect(Value.Check(CreateCollabRoomRequest, { name: 'Design notes' })).toBe(true);
    expect(Value.Check(CreateCollabRoomRequest, { name: '' })).toBe(false);
    expect(Value.Check(CreateCollabRoomRequest, { name: 'x'.repeat(COLLAB_ROOM_NAME_MAX + 1) })).toBe(false);
    expect(Value.Check(KeepCollabRoomRequest, { title: 'Kept' })).toBe(true);
    expect(Value.Check(KeepCollabRoomRequest, { title: 'x'.repeat(COLLAB_DOCUMENT_TITLE_MAX + 1) })).toBe(false);
    expect(Value.Check(KeepCollabRoomResponse, { entityId: '0199abcd' })).toBe(true);
    expect(Value.Check(KeepCollabRoomResponse, {})).toBe(false);
  });

  it('validates the history routes', () => {
    expect(Value.Check(CollabHistoryQuery, { doc: 'markdown-doc:abc' })).toBe(true);
    expect(Value.Check(CollabHistoryQuery, { doc: 'nope' })).toBe(false);
    const snapshot = { id: 's1', takenAt: '2026-10-24T10:00:00.000Z', bytes: 120 };
    expect(Value.Check(CollabHistoryResponse, { snapshots: [snapshot] })).toBe(true);
    expect(Value.Check(CollabHistoryResponse, { snapshots: Array.from({ length: COLLAB_HISTORY_MAX_SNAPSHOTS + 1 }, () => snapshot) })).toBe(false);
    expect(Value.Check(CollabHistoryResponse, { snapshots: [{ ...snapshot, bytes: -1 }] })).toBe(false);
    expect(Value.Check(CollabSnapshotResponse, { doc: 'scratchpad:default', takenAt: snapshot.takenAt, payload: { snippets: [] } })).toBe(true);
    expect(Value.Check(CollabSnapshotResponse, { doc: 'scratchpad:default', takenAt: snapshot.takenAt, payload: null })).toBe(false);
    expect(Value.Check(CollabRestoreResponse, { ok: true })).toBe(true);
    expect(Value.Check(CollabRestoreResponse, { ok: false })).toBe(false);
  });

  it('declares the collaboration audit events', () => {
    for (const event of ['collab.history-restored', 'collab.document-kept', 'collab.document-deleted']) expect(HUB_AUDIT_EVENTS).toContain(event);
  });
});
