/**
 * Pure, framework-free ULID generate/inspect logic, built on the `ulid` package
 * (Crockford base32, monotonic-safe) rather than hand-rolling the encoding.
 */
import { decodeTime, isValid, monotonicFactory, ulid } from 'ulid';

const monotonicUlid = monotonicFactory();

export function generateUlid(monotonic: boolean): string {
  return monotonic ? monotonicUlid() : ulid();
}

export interface UlidInspection {
  readonly valid: boolean;
  readonly timestamp?: Date;
  readonly randomness?: string;
}

export function inspectUlid(value: string): UlidInspection {
  const trimmed = value.trim().toUpperCase();
  if (!isValid(trimmed)) return { valid: false };

  return {
    valid: true,
    timestamp: new Date(decodeTime(trimmed)),
    randomness: trimmed.slice(10),
  };
}
