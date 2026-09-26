import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { inspectSnowflake, packSnowflake, SNOWFLAKE_PRESETS } from './snowflake-logic';

describe('Snowflake ID properties', () => {
  it('round-trips packed timestamp, worker, and sequence fields', () => {
    const config = SNOWFLAKE_PRESETS.twitter;
    invariant(
      (parts) => packSnowflake(config, { timestampMs: config.epoch + parts.delta, workerId: parts.workerId, sequence: parts.sequence }),
      fc.record({ delta: fc.integer({ min: 0, max: 1_000_000_000 }), workerId: fc.integer({ min: 0, max: 1023 }), sequence: fc.integer({ min: 0, max: 4095 }) }),
      (packed, parts) => {
        if (!packed.ok) return false;
        const inspected = inspectSnowflake(config, packed.id);
        return inspected.ok && inspected.value.timestamp.getTime() === config.epoch + parts.delta && inspected.value.workerId === parts.workerId && inspected.value.sequence === parts.sequence;
      },
    );
  });
});
