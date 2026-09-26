import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { validateCompose } from './docker-compose-validator-logic';

describe('docker-compose-validator properties', () => {
  it('returns a result for arbitrary YAML text', () => {
    neverThrows(validateCompose, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
