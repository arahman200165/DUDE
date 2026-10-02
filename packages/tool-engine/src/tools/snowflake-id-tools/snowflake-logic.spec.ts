import { generateSnowflake, inspectSnowflake, packSnowflake, SNOWFLAKE_PRESETS } from "./snowflake-logic.js";

describe('packSnowflake', () => {
  it('packs and unpacks a known value round-trip', () => {
    const config = SNOWFLAKE_PRESETS.twitter;
    const timestampMs = config.epoch + 123456;
    const packed = packSnowflake(config, { timestampMs, workerId: 5, sequence: 42 });
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;

    const inspected = inspectSnowflake(config, packed.id);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.value.timestamp.getTime()).toBe(timestampMs);
    expect(inspected.value.workerId).toBe(5);
    expect(inspected.value.sequence).toBe(42);
  });

  it('rejects a timestamp before the epoch', () => {
    const config = SNOWFLAKE_PRESETS.twitter;
    const result = packSnowflake(config, { timestampMs: config.epoch - 1, workerId: 0, sequence: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects a worker id out of range', () => {
    const config = SNOWFLAKE_PRESETS.twitter;
    const result = packSnowflake(config, { timestampMs: config.epoch + 1, workerId: 1024, sequence: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects a sequence out of range', () => {
    const config = SNOWFLAKE_PRESETS.twitter;
    const result = packSnowflake(config, { timestampMs: config.epoch + 1, workerId: 0, sequence: 4096 });
    expect(result.ok).toBe(false);
  });
});

describe('generateSnowflake', () => {
  it('generates a valid id decodable back to roughly the current time', () => {
    const config = SNOWFLAKE_PRESETS.discord;
    const result = generateSnowflake(config, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const inspected = inspectSnowflake(config, result.id);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(Math.abs(inspected.value.timestamp.getTime() - Date.now())).toBeLessThan(5000);
    expect(inspected.value.workerId).toBe(3);
  });

  it('generates distinct ids on rapid repeated calls', () => {
    const config = SNOWFLAKE_PRESETS.discord;
    const first = generateSnowflake(config, 1);
    const second = generateSnowflake(config, 1);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.id).not.toBe(second.id);
  });
});

describe('inspectSnowflake', () => {
  it('rejects non-numeric input', () => {
    expect(inspectSnowflake(SNOWFLAKE_PRESETS.twitter, 'not-a-number').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(inspectSnowflake(SNOWFLAKE_PRESETS.twitter, '').ok).toBe(false);
  });
});
