import { describe, expect, it } from 'vitest';
import { checkPrime, factorize, gcdList, lcmList, modInverse, modOp } from "./number-theory.js";

describe('modOp', () => {
  it('computes modular add/sub/mul', () => {
    expect(modOp(5n, 3n, 7n, 'add')).toEqual({ ok: true, value: 1n });
    expect(modOp(2n, 5n, 7n, 'sub')).toEqual({ ok: true, value: 4n });
    expect(modOp(4n, 4n, 7n, 'mul')).toEqual({ ok: true, value: 2n });
  });

  it('computes modular exponentiation via fast exponentiation', () => {
    expect(modOp(2n, 10n, 1000n, 'pow')).toEqual({ ok: true, value: 24n });
  });

  it('rejects a non-positive modulus', () => {
    expect(modOp(1n, 1n, 0n, 'add').ok).toBe(false);
  });

  it('rejects a negative exponent', () => {
    expect(modOp(2n, -1n, 7n, 'pow').ok).toBe(false);
  });
});

describe('modInverse', () => {
  it('finds the modular inverse when it exists', () => {
    expect(modInverse(3n, 11n)).toEqual({ ok: true, value: 4n });
  });

  it('rejects a and m that are not coprime', () => {
    expect(modInverse(2n, 4n).ok).toBe(false);
  });
});

describe('gcdList / lcmList', () => {
  it('reduces a list of numbers via gcd/lcm', () => {
    expect(gcdList([48n, 18n, 12n])).toEqual({ ok: true, value: 6n });
    expect(lcmList([4n, 6n, 3n])).toEqual({ ok: true, value: 12n });
  });

  it('rejects an empty list', () => {
    expect(gcdList([]).ok).toBe(false);
  });
});

describe('checkPrime', () => {
  it('identifies known primes and composites', () => {
    expect(checkPrime(97n)).toEqual({ ok: true, value: { isPrime: true } });
    expect(checkPrime(1n)).toEqual({ ok: true, value: { isPrime: false } });
    expect(checkPrime(100n)).toEqual({ ok: true, value: { isPrime: false, smallestFactor: 2n } });
  });
});

describe('factorize', () => {
  it('factorizes a composite number into primes', () => {
    expect(factorize(100n)).toEqual({ ok: true, value: [2n, 2n, 5n, 5n] });
    expect(factorize(97n)).toEqual({ ok: true, value: [97n] });
  });

  it('rejects an input below 2', () => {
    expect(factorize(1n).ok).toBe(false);
  });
});
