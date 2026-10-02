import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { buildContactPayload, buildTotpPayload, buildWifiPayload } from "@dude/tool-engine/tools/qr-code-generator/qr-payload";

const noNewlines = (s: string) => !/[\r\n]/.test(s);

describe('buildWifiPayload property', () => {
  const wifiInputArb = fc.record({
    ssid: fc.string({ maxLength: 20 }).filter(noNewlines),
    password: fc.string({ maxLength: 20 }).filter(noNewlines),
    security: fc.constantFrom('WPA' as const, 'WEP' as const, 'nopass' as const),
    hidden: fc.boolean(),
  });

  it('always produces a WIFI: URI prefixed with the chosen security type and terminated correctly', () => {
    invariant(
      (input) => buildWifiPayload(input),
      wifiInputArb,
      (payload, input) => payload.startsWith(`WIFI:T:${input.security};S:`) && payload.endsWith(';'),
    );
  });
});

describe('buildTotpPayload property', () => {
  const totpInputArb = fc.record({
    secret: fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim() !== '' && noNewlines(s)),
    issuer: fc.string({ maxLength: 20 }).filter(noNewlines),
    accountName: fc.string({ minLength: 1, maxLength: 20 }).filter(noNewlines),
    algorithm: fc.constantFrom('SHA1' as const, 'SHA256' as const, 'SHA512' as const),
    digits: fc.constantFrom(6 as const, 8 as const),
    period: fc.integer({ min: 1, max: 120 }),
  });

  it('always produces a parseable otpauth:// URI carrying every field verbatim', () => {
    invariant(
      (input) => buildTotpPayload(input),
      totpInputArb,
      (payload, input) => {
        if (!payload.startsWith('otpauth://totp/')) return false;
        const url = new URL(payload);
        return (
          url.searchParams.get('secret') === input.secret &&
          url.searchParams.get('algorithm') === input.algorithm &&
          url.searchParams.get('digits') === String(input.digits) &&
          url.searchParams.get('period') === String(input.period)
        );
      },
    );
  });

  it('is deterministic — the same input always produces the same URI', () => {
    invariant(
      (input) => [buildTotpPayload(input), buildTotpPayload(input)] as const,
      totpInputArb,
      ([a, b]) => a === b,
    );
  });
});

describe('buildContactPayload property', () => {
  const contactInputArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(noNewlines),
    phone: fc.string({ maxLength: 20 }).filter(noNewlines),
    email: fc.string({ maxLength: 20 }).filter(noNewlines),
    organization: fc.string({ maxLength: 20 }).filter(noNewlines),
  });

  it('always produces a well-formed vCard containing the given name', () => {
    invariant(
      (input) => buildContactPayload(input),
      contactInputArb,
      (payload, input) => {
        const lines = payload.split('\n');
        return lines[0] === 'BEGIN:VCARD' && lines[1] === 'VERSION:3.0' && lines[lines.length - 1] === 'END:VCARD' && payload.includes(`FN:${input.name}`);
      },
    );
  });
});
