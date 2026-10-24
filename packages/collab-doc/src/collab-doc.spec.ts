import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import {
  COLLAB_DOC_KINDS, COLLAB_FRAME_AWARENESS, COLLAB_FRAME_SYNC, addSnippet, applyTextTo, collabKindForEntity, contentBytes,
  decodeFrame, editSnippet, encodeFrame, formatCollabDocKey, isCollabAwarenessState, materializeCollabDoc, moveSnippet,
  parseCollabDocKey, removeSnippet, restoreAsForwardEdit, rewriteAwarenessUpdate, seedCollabDoc, utf8Length,
  type CollabAwarenessIdentity, type CollabSnippet,
} from './index.js';

const sync = (a: Y.Doc, b: Y.Doc): void => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
};

/** Two replicas of the same seeded document, as the Hub and a browser would hold them. */
function pair(kind: Parameters<typeof seedCollabDoc>[1], payload: Record<string, unknown>): [Y.Doc, Y.Doc] {
  const hub = new Y.Doc();
  seedCollabDoc(hub, kind, payload);
  const client = new Y.Doc();
  sync(hub, client);
  return [hub, client];
}

const snip = (id: string, title: string, body: string, createdAt: string, extra: Partial<CollabSnippet> = {}): CollabSnippet =>
  ({ id, title, body, createdAt, ...extra });

describe('document keys', () => {
  it('formats and parses exactly the closed kinds', () => {
    expect(COLLAB_DOC_KINDS).toEqual(['scratchpad', 'user-script', 'markdown-doc', 'room']);
    expect(formatCollabDocKey('user-script', 'abc-123_X')).toBe('user-script:abc-123_X');
    expect(parseCollabDocKey('markdown-doc:doc1')).toEqual({ kind: 'markdown-doc', id: 'doc1' });
    expect(parseCollabDocKey('room:r00m')).toEqual({ kind: 'room', id: 'r00m' });
  });

  it('forces the scratchpad id to default', () => {
    expect(formatCollabDocKey('scratchpad', 'default')).toBe('scratchpad:default');
    expect(() => formatCollabDocKey('scratchpad', 'other')).toThrow(RangeError);
    expect(parseCollabDocKey('scratchpad:other')).toBeNull();
  });

  it('rejects malformed keys', () => {
    for (const bad of ['', 'room', 'room:', ':id', 'unknown:id', 'room:a b', 'room:a:b', `room:${'x'.repeat(65)}`, 'room:../x']) {
      expect(parseCollabDocKey(bad)).toBeNull();
    }
    expect(parseCollabDocKey(`room:${'x'.repeat(64)}`)).not.toBeNull();
  });

  it('maps entity types, with no entity for rooms', () => {
    expect(collabKindForEntity('scratchpad')).toBe('scratchpad');
    expect(collabKindForEntity('user-script')).toBe('user-script');
    expect(collabKindForEntity('markdown-doc')).toBe('markdown-doc');
    expect(collabKindForEntity('room')).toBeNull();
    expect(collabKindForEntity('pipeline')).toBeNull();
  });
});

describe('frames', () => {
  it('round-trips every channel, kind and payload', () => {
    fc.assert(fc.property(fc.nat({ max: 2 ** 31 }), fc.constantFrom(COLLAB_FRAME_SYNC, COLLAB_FRAME_AWARENESS), fc.uint8Array({ maxLength: 300 }), (channel, kind, payload) => {
      const frame = decodeFrame(encodeFrame(channel, kind, payload));
      expect(frame).not.toBeNull();
      expect(frame!.channel).toBe(channel);
      expect(frame!.kind).toBe(kind);
      expect([...frame!.payload]).toEqual([...payload]);
    }));
  });

  it('returns null, never throws, for malformed input', () => {
    const good = encodeFrame(3, COLLAB_FRAME_SYNC, new Uint8Array([1, 2, 3]));
    expect(decodeFrame(new Uint8Array())).toBeNull();
    expect(decodeFrame(good.slice(0, good.length - 1))).toBeNull();
    expect(decodeFrame(new Uint8Array([...good, 0]))).toBeNull();
    expect(decodeFrame(new Uint8Array([0, 2, 0]))).toBeNull();
    expect(decodeFrame(new Uint8Array([0, 0, 0xff, 0xff, 0xff, 0xff, 0x0f]))).toBeNull();
    expect(decodeFrame(new Uint8Array([0x80]))).toBeNull();
    expect(decodeFrame('nope' as unknown as Uint8Array)).toBeNull();
    fc.assert(fc.property(fc.uint8Array({ maxLength: 40 }), bytes => {
      const frame = decodeFrame(bytes);
      if (frame) expect(frame.payload).toBeInstanceOf(Uint8Array);
    }));
  });

  it('refuses to encode an illegal channel', () => {
    expect(() => encodeFrame(-1, COLLAB_FRAME_SYNC, new Uint8Array())).toThrow(RangeError);
    expect(() => encodeFrame(1.5, COLLAB_FRAME_SYNC, new Uint8Array())).toThrow(RangeError);
  });
});

describe('applyTextTo', () => {
  it('preserves a concurrent remote edit made elsewhere in the text', () => {
    const [a, b] = pair('user-script', { body: 'alpha beta gamma delta' });
    applyTextTo(a.getText('body'), 'ALPHA beta gamma delta');
    b.getText('body').insert('alpha beta gamma delta'.length, ' epsilon');
    applyTextTo(b.getText('body'), 'alpha beta GAMMA delta epsilon');
    sync(a, b);
    expect(a.getText('body').toString()).toBe('ALPHA beta GAMMA delta epsilon');
    expect(b.getText('body').toString()).toBe('ALPHA beta GAMMA delta epsilon');
  });

  it('keeps a remote insert between two local hunks', () => {
    const [a, b] = pair('user-script', { body: 'one two three four five' });
    b.getText('body').insert('one two '.length, 'REMOTE ');
    applyTextTo(a.getText('body'), 'ONE two three four FIVE');
    sync(a, b);
    expect(a.getText('body').toString()).toBe('ONE two REMOTE three four FIVE');
    expect(b.getText('body').toString()).toBe(a.getText('body').toString());
  });

  it('reports no change for equal text and never splits a surrogate pair', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    text.insert(0, 'a😀b😁c');
    expect(applyTextTo(text, 'a😀b😁c')).toBe(false);
    expect(applyTextTo(text, 'a😂b😁c😀')).toBe(true);
    expect(text.toString()).toBe('a😂b😁c😀');
    expect(text.toString().isWellFormed()).toBe(true);
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom('a', '😀', '😁', 'é', '\n'), maxLength: 30 }), fc.string({ unit: fc.constantFrom('a', '😀', '😁', 'é', '\n'), maxLength: 30 }), (from, to) => {
      const d = new Y.Doc();
      const t = d.getText('t');
      t.insert(0, from);
      applyTextTo(t, to);
      expect(t.toString()).toBe(to);
    }));
  });
});

describe('scratchpad schema', () => {
  const payload = {
    schemaVersion: 1,
    drawerExpanded: true,
    snippets: [
      snip('s1', 'First', 'body one', '2026-01-01T00:00:00.000Z'),
      snip('s2', 'Second', 'body two', '2026-01-02T00:00:00.000Z', { sourceToolId: 'base64' }),
    ],
  };

  it('seeds and materializes the same payload, keeping non-collaborative fields', () => {
    const doc = new Y.Doc();
    seedCollabDoc(doc, 'scratchpad', payload);
    expect(materializeCollabDoc(doc, 'scratchpad', payload)).toEqual(payload);
    const result = materializeCollabDoc(doc, 'scratchpad', { schemaVersion: 1, drawerExpanded: false, snippets: [] });
    expect(result['drawerExpanded']).toBe(false);
    expect(result['schemaVersion']).toBe(1);
    expect((result['snippets'] as CollabSnippet[]).map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('seeds only once', () => {
    const doc = new Y.Doc();
    seedCollabDoc(doc, 'scratchpad', payload);
    seedCollabDoc(doc, 'scratchpad', { snippets: [snip('s9', 'x', 'y', '2026-02-01T00:00:00.000Z')] });
    expect((materializeCollabDoc(doc, 'scratchpad', {})['snippets'] as CollabSnippet[]).map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('converges on concurrent snippet edits, adds, removes and reorders', () => {
    const [a, b] = pair('scratchpad', payload);
    editSnippet(a, 's1', { title: 'First!', body: 'body one A' });
    editSnippet(b, 's1', { body: 'B body one' });
    addSnippet(a, snip('s3', 'Third', '', '2026-01-03T00:00:00.000Z'));
    addSnippet(b, snip('s4', 'Fourth', '', '2026-01-04T00:00:00.000Z'));
    removeSnippet(b, 's2');
    sync(a, b);
    const ma = materializeCollabDoc(a, 'scratchpad', payload);
    const mb = materializeCollabDoc(b, 'scratchpad', payload);
    expect(ma).toEqual(mb);
    const snippets = ma['snippets'] as CollabSnippet[];
    expect(snippets.map(s => s.id).sort()).toEqual(['s1', 's3', 's4']);
    expect(snippets.find(s => s.id === 's1')!.title).toBe('First!');
    expect(snippets.find(s => s.id === 's1')!.body).toBe('B body one A');
    moveSnippet(a, 's4', 0);
    sync(a, b);
    expect((materializeCollabDoc(b, 'scratchpad', payload)['snippets'] as CollabSnippet[])[0]!.id).toBe('s4');
  });

  it('orders ids missing from the order by createdAt and skips deleted ids', () => {
    const doc = new Y.Doc();
    seedCollabDoc(doc, 'scratchpad', payload);
    const order = doc.getArray<string>('order');
    order.delete(0, order.length);
    order.insert(0, ['ghost', 's2', 's2']);
    expect((materializeCollabDoc(doc, 'scratchpad', {})['snippets'] as CollabSnippet[]).map(s => s.id)).toEqual(['s2', 's1']);
  });

  it('restores a snapshot as a forward edit that still merges with later concurrent edits', () => {
    const [a, b] = pair('scratchpad', payload);
    const snapshot = materializeCollabDoc(a, 'scratchpad', payload);
    editSnippet(a, 's1', { title: 'Changed', body: 'changed body' });
    removeSnippet(a, 's2');
    addSnippet(a, snip('s5', 'Extra', 'extra', '2026-03-01T00:00:00.000Z'));
    sync(a, b);
    const before = Y.encodeStateVector(a);
    restoreAsForwardEdit(a, 'scratchpad', snapshot);
    expect(materializeCollabDoc(a, 'scratchpad', payload)).toEqual(snapshot);
    // The document was only ever extended: the old state vector is dominated by the new one.
    const after = Y.decodeStateVector(Y.encodeStateVector(a));
    for (const [client, clock] of Y.decodeStateVector(before)) expect(after.get(client)!).toBeGreaterThanOrEqual(clock);
    editSnippet(b, 's1', { body: 'changed body (late)' });
    sync(a, b);
    const merged = materializeCollabDoc(b, 'scratchpad', payload)['snippets'] as CollabSnippet[];
    expect(materializeCollabDoc(a, 'scratchpad', payload)).toEqual(materializeCollabDoc(b, 'scratchpad', payload));
    expect(merged.map(s => s.id)).toEqual(['s1', 's2']);
    expect(merged[0]!.body).toContain('(late)');
    // Both replicas converge; concurrent insertions at the same position are ordered by Yjs client id, so either order is valid.
    expect(['body one (late)', 'body (late) one']).toContain(merged[0]!.body);
    expect(merged[1]!.sourceToolId).toBe('base64');
  });

  it('measures the materialized content in UTF-8 bytes', () => {
    const doc = new Y.Doc();
    seedCollabDoc(doc, 'scratchpad', { snippets: [snip('s1', 'é', '😀', 'x')] });
    expect(contentBytes(doc, 'scratchpad')).toBe(utf8Length(JSON.stringify({ snippets: [snip('s1', 'é', '😀', 'x')] })));
    expect(utf8Length('aé€😀')).toBe(1 + 2 + 3 + 4);
  });
});

describe('user-script and markdown schemas', () => {
  it('materializes the script body over the current record', () => {
    const [a, b] = pair('user-script', { body: 'let x = 1;\nlet y = 2;\n', name: 'S' });
    applyTextTo(a.getText('body'), 'let x = 10;\nlet y = 2;\n');
    applyTextTo(b.getText('body'), 'let x = 1;\nlet y = 20;\n');
    sync(a, b);
    expect(materializeCollabDoc(a, 'user-script', { id: 'u1', name: 'S', body: 'stale' })).toEqual({ id: 'u1', name: 'S', body: 'let x = 10;\nlet y = 20;\n' });
    restoreAsForwardEdit(a, 'user-script', { body: 'let x = 1;\nlet y = 2;\n' });
    sync(a, b);
    expect(b.getText('body').toString()).toBe('let x = 1;\nlet y = 2;\n');
  });

  it('keeps title and body for markdown-doc and the body only for a room', () => {
    const doc = new Y.Doc();
    seedCollabDoc(doc, 'markdown-doc', { title: 'Notes', body: '# Hi' });
    expect(doc.getText('markdown').toString()).toBe('# Hi');
    expect(materializeCollabDoc(doc, 'markdown-doc', { id: 'd1', title: 'old', body: 'old', extra: 1 })).toEqual({ id: 'd1', title: 'Notes', body: '# Hi', extra: 1 });
    restoreAsForwardEdit(doc, 'markdown-doc', { title: 'Older', body: '# Hello' });
    expect(materializeCollabDoc(doc, 'markdown-doc', {})).toEqual({ title: 'Older', body: '# Hello' });
    const room = new Y.Doc();
    seedCollabDoc(room, 'room', { body: 'room text', title: 'ignored' });
    expect(room.getMap('meta').size).toBe(0);
    expect(materializeCollabDoc(room, 'room', {})).toEqual({ body: 'room text' });
    // An ephemeral room's document keeps as a markdown-doc: same text root.
    expect(materializeCollabDoc(room, 'markdown-doc', { title: 'Kept' })).toEqual({ title: 'Kept', body: 'room text' });
  });
});

describe('awareness', () => {
  const identity: CollabAwarenessIdentity = { deviceId: 'dev-real', name: 'Real Name', colorSlot: 3 };
  const rel = { type: { client: 1, clock: 2 }, tname: null, item: { client: 1, clock: 1 }, assoc: 0 };

  function encode(entries: Array<{ clientId: number; clock: number; state: unknown }>): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, entries.length);
    for (const e of entries) {
      encoding.writeVarUint(encoder, e.clientId);
      encoding.writeVarUint(encoder, e.clock);
      encoding.writeVarString(encoder, JSON.stringify(e.state));
    }
    return encoding.toUint8Array(encoder);
  }

  it('validates the state shape strictly', () => {
    const ok = { user: { deviceId: 'd', name: 'n', colorSlot: 7 }, cursor: { anchor: rel, head: rel } };
    expect(isCollabAwarenessState(ok)).toBe(true);
    expect(isCollabAwarenessState({ ...ok, cursor: null })).toBe(true);
    for (const bad of [
      null, 'x', [], {}, { ...ok, extra: 1 }, { user: ok.user }, { ...ok, user: { ...ok.user, colorSlot: 8 } },
      { ...ok, user: { ...ok.user, colorSlot: 1.5 } }, { ...ok, user: { ...ok.user, colorSlot: -1 } }, { ...ok, user: { ...ok.user, name: '' } },
      { ...ok, user: { ...ok.user, extra: true } }, { ...ok, cursor: { anchor: rel } }, { ...ok, cursor: { anchor: rel, head: 'x' } },
      { ...ok, cursor: { anchor: { evil: 1 }, head: rel } }, { ...ok, cursor: { anchor: rel, head: rel, more: 1 } },
    ]) expect(isCollabAwarenessState(bad)).toBe(false);
  });

  it('replaces a spoofed user with the authenticated identity and drops invalid states', () => {
    const rewritten = rewriteAwarenessUpdate(encode([
      { clientId: 11, clock: 4, state: { user: { deviceId: 'someone-else', name: 'Boss', colorSlot: 0 }, cursor: { anchor: rel, head: rel } } },
      { clientId: 12, clock: 1, state: { user: identity, cursor: 'garbage' } },
      { clientId: 13, clock: 1, state: { user: identity, cursor: null, injected: '<script>' } },
      { clientId: 14, clock: 9, state: null },
      { clientId: 15, clock: 1, state: 'text' },
    ]), identity)!;
    expect(rewritten).not.toBeNull();
    const target = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(target);
    awareness.setLocalState(null);
    awarenessProtocol.applyAwarenessUpdate(awareness, rewritten, 'test');
    const states = awareness.getStates();
    expect(states.get(11)).toEqual({ user: identity, cursor: { anchor: rel, head: rel } });
    expect(isCollabAwarenessState(states.get(11))).toBe(true);
    expect(states.has(12)).toBe(false);
    expect(states.has(13)).toBe(false);
    expect(states.has(15)).toBe(false);
    awareness.destroy();
  });

  it('round-trips a real y-protocols update and forwards removals', () => {
    const doc = new Y.Doc();
    const source = new awarenessProtocol.Awareness(doc);
    source.setLocalState({ user: { deviceId: 'spoof', name: 'Spoof', colorSlot: 5 }, cursor: null });
    const update = awarenessProtocol.encodeAwarenessUpdate(source, [doc.clientID]);
    const rewritten = rewriteAwarenessUpdate(update, identity)!;
    const sink = new awarenessProtocol.Awareness(new Y.Doc());
    awarenessProtocol.applyAwarenessUpdate(sink, rewritten, 'test');
    expect(sink.getStates().get(doc.clientID)).toEqual({ user: identity, cursor: null });
    source.setLocalState(null);
    const removal = rewriteAwarenessUpdate(awarenessProtocol.encodeAwarenessUpdate(source, [doc.clientID]), identity)!;
    awarenessProtocol.applyAwarenessUpdate(sink, removal, 'test');
    expect(sink.getStates().has(doc.clientID)).toBe(false);
    source.destroy();
    sink.destroy();
  });

  it('returns null for malformed updates, an invalid identity or nothing to forward', () => {
    expect(rewriteAwarenessUpdate(new Uint8Array(), identity)).toBeNull();
    expect(rewriteAwarenessUpdate(new Uint8Array([5, 1]), identity)).toBeNull();
    expect(rewriteAwarenessUpdate(new Uint8Array([...encode([{ clientId: 1, clock: 1, state: null }]), 0]), identity)).toBeNull();
    expect(rewriteAwarenessUpdate(encode([{ clientId: 1, clock: 1, state: { user: identity, cursor: 3 } }]), identity)).toBeNull();
    expect(rewriteAwarenessUpdate(encode([{ clientId: 1, clock: 1, state: null }]), { ...identity, colorSlot: 9 })).toBeNull();
    fc.assert(fc.property(fc.uint8Array({ maxLength: 60 }), bytes => {
      const out = rewriteAwarenessUpdate(bytes, identity);
      expect(out === null || out instanceof Uint8Array).toBe(true);
    }));
  });
});
