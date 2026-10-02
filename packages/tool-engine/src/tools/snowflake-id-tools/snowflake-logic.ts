/**
 * Pure, framework-free Snowflake ID pack/unpack — hand-rolled bit-packing,
 * no canonical npm package exists for this (every vendor's Snowflake variant
 * is just a different epoch + worker/sequence bit split of the same 63-bit shape).
 */

export interface SnowflakeConfig {
  readonly epoch: number; // custom epoch, ms since Unix epoch
  readonly workerBits: number;
  readonly sequenceBits: number;
}

export type SnowflakePreset = 'twitter' | 'discord' | 'instagram' | 'custom';

/** Instagram's shard id occupies the same bit position as a "worker id" here; its own sequence counter is per-shard-per-ms. */
export const SNOWFLAKE_PRESETS: Record<Exclude<SnowflakePreset, 'custom'>, SnowflakeConfig> = {
  twitter: { epoch: 1288834974657, workerBits: 10, sequenceBits: 12 },
  discord: { epoch: 1420070400000, workerBits: 10, sequenceBits: 12 },
  instagram: { epoch: 1314220021721, workerBits: 13, sequenceBits: 10 },
};

export interface PackOptions {
  readonly timestampMs: number;
  readonly workerId: number;
  readonly sequence: number;
}

export type PackResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: string };

export function packSnowflake(config: SnowflakeConfig, opts: PackOptions): PackResult {
  const delta = opts.timestampMs - config.epoch;
  if (delta < 0) return { ok: false, error: 'Timestamp is before the configured epoch.' };

  const maxWorker = 2 ** config.workerBits - 1;
  const maxSequence = 2 ** config.sequenceBits - 1;
  if (!Number.isInteger(opts.workerId) || opts.workerId < 0 || opts.workerId > maxWorker) {
    return { ok: false, error: `Worker id must be an integer between 0 and ${maxWorker}.` };
  }
  if (!Number.isInteger(opts.sequence) || opts.sequence < 0 || opts.sequence > maxSequence) {
    return { ok: false, error: `Sequence must be an integer between 0 and ${maxSequence}.` };
  }

  const id =
    (BigInt(delta) << BigInt(config.workerBits + config.sequenceBits)) |
    (BigInt(opts.workerId) << BigInt(config.sequenceBits)) |
    BigInt(opts.sequence);

  return { ok: true, id: id.toString() };
}

let lastGeneratedMs = 0;
let sequenceCounter = 0;

/** Generates a fresh id from the current time, incrementing the in-process sequence counter within the same millisecond. */
export function generateSnowflake(config: SnowflakeConfig, workerId: number): PackResult {
  const now = Date.now();
  if (now === lastGeneratedMs) {
    sequenceCounter = (sequenceCounter + 1) % (2 ** config.sequenceBits);
  } else {
    lastGeneratedMs = now;
    sequenceCounter = 0;
  }
  return packSnowflake(config, { timestampMs: now, workerId, sequence: sequenceCounter });
}

export interface SnowflakeInspection {
  readonly timestamp: Date;
  readonly workerId: number;
  readonly sequence: number;
}

export type InspectResult = { readonly ok: true; readonly value: SnowflakeInspection } | { readonly ok: false; readonly error: string };

export function inspectSnowflake(config: SnowflakeConfig, rawId: string): InspectResult {
  const trimmed = rawId.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Enter a Snowflake id as a decimal integer.' };

  let id: bigint;
  try {
    id = BigInt(trimmed);
  } catch {
    return { ok: false, error: 'Enter a Snowflake id as a decimal integer.' };
  }

  const sequenceMask = BigInt(2 ** config.sequenceBits - 1);
  const workerMask = BigInt(2 ** config.workerBits - 1);

  const sequence = Number(id & sequenceMask);
  const workerId = Number((id >> BigInt(config.sequenceBits)) & workerMask);
  const delta = id >> BigInt(config.workerBits + config.sequenceBits);

  return {
    ok: true,
    value: { timestamp: new Date(config.epoch + Number(delta)), workerId, sequence },
  };
}
