import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { checkPrime, factorize, gcdList, modInverse } from "@dude/tool-engine/tools/number-theory-toolkit/number-theory";

function isPrime(value: bigint): boolean {
  const result = checkPrime(value);
  return result.ok && result.value.isPrime;
}

function areCoprime(a: bigint, b: bigint): boolean {
  const result = gcdList([a, b]);
  return result.ok && result.value === 1n;
}

describe('number theory properties', () => {
  it('returns prime factors whose product reconstructs every eligible input', () => {
    invariant(
      (n) => factorize(n),
      fc.bigInt({ min: 2n, max: 1_000_000n }),
      (result, n) => result.ok && result.value.reduce((product, factor) => product * factor, 1n) === n && result.value.every(isPrime),
    );
  });

  it('returns modular inverses that satisfy the defining congruence', () => {
    invariant(
      ({ a, m }) => modInverse(a, m),
      fc.record({ a: fc.bigInt({ min: 1n, max: 500n }), m: fc.bigInt({ min: 2n, max: 500n }) }).filter(({ a, m }) => areCoprime(a, m)),
      (result, { a, m }) => result.ok && ((a * result.value) % m + m) % m === 1n,
    );
  });
});
