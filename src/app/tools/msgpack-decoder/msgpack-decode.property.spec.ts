import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { decodeMsgpack } from './msgpack-decode';

describe('MessagePack decoder properties', () => {
  it('never throws for arbitrary byte sequences', () => {
    neverThrows(decodeMsgpack, fc.uint8Array(), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});
