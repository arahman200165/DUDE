import { describe, expect, it } from 'vitest';
import { evaluateAuthority } from './authority-check.js';

const enrolled = { hubInstanceId: 'hub-a', authorityEpoch: 3 };

describe('evaluateAuthority', () => {
  it('accepts the same instance at the same epoch', () => {
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-a', authorityEpoch: 3, authorityState: 'active' })).toEqual({ kind: 'ok', epoch: 3 });
  });

  it('reads an answer that reports nothing as unchanged (an older Hub)', () => {
    expect(evaluateAuthority(enrolled, {})).toEqual({ kind: 'ok', epoch: 3 });
    expect(evaluateAuthority({ hubInstanceId: 'hub-a', authorityEpoch: 1 }, { hubInstanceId: 'hub-a' })).toEqual({ kind: 'ok', epoch: 1 });
  });

  it('reports the higher epoch so the caller can raise the stored one', () => {
    expect(evaluateAuthority(enrolled, { authorityEpoch: 5 })).toEqual({ kind: 'ok', epoch: 5 });
  });

  it('flags a different instance id, with what the Hub reported', () => {
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-b', authorityEpoch: 4 })).toEqual({ kind: 'changed', reason: 'instance-changed', hubInstanceId: 'hub-b', epoch: 4 });
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-b' })).toEqual({ kind: 'changed', reason: 'instance-changed', hubInstanceId: 'hub-b', epoch: null });
  });

  it('flags a transferred Hub even at the same instance and epoch', () => {
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-a', authorityEpoch: 3, authorityState: 'transferred' })).toEqual({ kind: 'changed', reason: 'transferred', hubInstanceId: 'hub-a', epoch: 3 });
    expect(evaluateAuthority(enrolled, { authorityState: 'transferred' })).toEqual({ kind: 'changed', reason: 'transferred', hubInstanceId: null, epoch: null });
  });

  it('flags a lower epoch', () => {
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-a', authorityEpoch: 2 })).toEqual({ kind: 'changed', reason: 'epoch-lower', hubInstanceId: 'hub-a', epoch: 2 });
    expect(evaluateAuthority(enrolled, { authorityEpoch: 1 })).toEqual({ kind: 'changed', reason: 'epoch-lower', hubInstanceId: null, epoch: 1 });
  });

  it('orders the reasons: instance-changed, then transferred, then epoch-lower', () => {
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-b', authorityEpoch: 1, authorityState: 'transferred' })).toMatchObject({ reason: 'instance-changed' });
    expect(evaluateAuthority(enrolled, { hubInstanceId: 'hub-a', authorityEpoch: 1, authorityState: 'transferred' })).toMatchObject({ reason: 'transferred' });
  });
});
