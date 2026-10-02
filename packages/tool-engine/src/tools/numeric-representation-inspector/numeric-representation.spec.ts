import { describe, expect, it } from 'vitest';
import { inspectEndianness, inspectIeee754, inspectInteger } from "./numeric-representation.js";

describe('inspectEndianness', () => {
  it('byte-swaps a 32-bit value between big and little endian', () => {
    const result = inspectEndianness('12345678', 32);
    expect(result.ok && result.value.bigEndianHex).toBe('12345678');
    expect(result.ok && result.value.littleEndianHex).toBe('78563412');
    expect(result.ok && result.value.bigEndianValue).toBe(0x12345678n);
    expect(result.ok && result.value.littleEndianValue).toBe(0x78563412n);
  });

  it('rejects the wrong digit count for the chosen width', () => {
    expect(inspectEndianness('1234', 32).ok).toBe(false);
  });

  it('rejects non-hex input', () => {
    expect(inspectEndianness('zzzzzzzz', 32).ok).toBe(false);
  });
});

describe('inspectIeee754', () => {
  it('matches the known float32 bit pattern for 1.0', () => {
    const result = inspectIeee754('1', 32);
    expect(result.ok && result.value.hex).toBe('3f800000');
    expect(result.ok && result.value.sign).toBe(0);
    expect(result.ok && result.value.exponentValue).toBe(0);
    expect(result.ok && result.value.reconstructed).toBe(1);
  });

  it('matches the known float32 bit pattern for -1.0', () => {
    const result = inspectIeee754('-1', 32);
    expect(result.ok && result.value.hex).toBe('bf800000');
    expect(result.ok && result.value.sign).toBe(1);
  });

  it('matches the known float64 bit pattern for 1.0', () => {
    const result = inspectIeee754('1', 64);
    expect(result.ok && result.value.hex).toBe('3ff0000000000000');
  });

  it('rejects empty or non-numeric input', () => {
    expect(inspectIeee754('', 32).ok).toBe(false);
    expect(inspectIeee754('not a number', 32).ok).toBe(false);
  });
});

describe('inspectInteger', () => {
  it('shows the two\'s-complement signed value and overflow flag per width', () => {
    const result = inspectInteger('-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row8 = result.value.find((r) => r.bits === 8)!;
    expect(row8.unsignedValue).toBe(255n);
    expect(row8.signedValue).toBe(-1n);
    expect(row8.hex).toBe('ff');
    expect(row8.binary).toBe('11111111');
    expect(row8.overflowed).toBe(true);

    const row64 = result.value.find((r) => r.bits === 64)!;
    expect(row64.signedValue).toBe(-1n);
  });

  it('flags overflow only for widths too narrow to hold the value', () => {
    const result = inspectInteger('300');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.find((r) => r.bits === 8)!.overflowed).toBe(true);
    expect(result.value.find((r) => r.bits === 16)!.overflowed).toBe(false);
  });

  it('rejects invalid input', () => {
    expect(inspectInteger('not a number').ok).toBe(false);
  });
});
