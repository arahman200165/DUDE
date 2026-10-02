import { describe, it, expect } from 'vitest';
import { checkProtocolCompatibility as check } from './compat.js';

describe('checkProtocolCompatibility', () => {
  it.each([
    [{ protocolVersion: 1, minClientProtocol: 1 }, { protocolVersion: 1, minHubProtocol: 1 }, 'compatible'],
    [{ protocolVersion: 3, minClientProtocol: 2 }, { protocolVersion: 2, minHubProtocol: 1 }, 'compatible'],
    [{ protocolVersion: 3, minClientProtocol: 3 }, { protocolVersion: 2, minHubProtocol: 1 }, 'client-too-old'],
    [{ protocolVersion: 1, minClientProtocol: 1 }, { protocolVersion: 2, minHubProtocol: 2 }, 'hub-too-old'],
    [{ protocolVersion: 2, minClientProtocol: 2 }, { protocolVersion: 1, minHubProtocol: 3 }, 'client-too-old'],
  ] as const)('%j vs %j => %s', (h, c, expected) => expect(check(h, c)).toBe(expected));
});
