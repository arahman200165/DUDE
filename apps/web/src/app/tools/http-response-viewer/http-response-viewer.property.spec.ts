import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { parseHttpResponseText } from "@dude/tool-engine/tools/http-response-viewer/http-response-parse";
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

interface ResponseFixture {
  readonly httpVersion: string;
  readonly statusCode: number;
  readonly statusText: string;
  readonly headers: readonly KeyValuePair[];
  readonly body: string;
}

const singleLine = (s: string) => !s.includes('\n') && !s.includes('\r');
const safeText = fc.string().filter(singleLine).map((s) => s.trim());
const headerKey = fc.string().filter((s) => singleLine(s) && !s.includes(':')).map((s) => s.trim());
const headerArb: fc.Arbitrary<KeyValuePair> = fc.record({ key: headerKey, value: safeText });

const nonJsonBody = fc
  .string()
  .filter((s) => !s.includes('\r'))
  .filter((s) => {
    try {
      JSON.parse(s);
      return false;
    } catch {
      return true;
    }
  });

const fixtureArb: fc.Arbitrary<ResponseFixture> = fc.record({
  httpVersion: fc.constantFrom('1.0', '1.1', '2'),
  statusCode: fc.integer({ min: 100, max: 599 }),
  statusText: safeText,
  headers: fc.array(headerArb, { maxLength: 5 }),
  body: nonJsonBody,
});

function encode(fixture: ResponseFixture): string {
  const lines = [`HTTP/${fixture.httpVersion} ${fixture.statusCode} ${fixture.statusText}`];
  for (const header of fixture.headers) lines.push(`${header.key}: ${header.value}`);
  lines.push('', fixture.body);
  return lines.join('\n');
}

function decode(raw: unknown): ResponseFixture {
  const result = parseHttpResponseText(raw as string);
  if (!result.ok) throw new Error(`expected parseHttpResponseText to succeed, got error: ${result.ok === false ? result.error : ''}`);
  return {
    httpVersion: result.httpVersion,
    statusCode: result.statusCode,
    statusText: result.statusText,
    headers: result.headers,
    body: result.bodyRaw,
  };
}

describe('parseHttpResponseText round-trip', () => {
  it('recovers version/status/headers/body from a constructed non-JSON HTTP response', () => {
    roundTrip(encode, decode, fixtureArb);
  });

  it('a JSON body is recognized and pretty-printed to the same parsed value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const raw = `HTTP/1.1 200 OK\nContent-Type: application/json\n\n${JSON.stringify(value)}`;
        const result = parseHttpResponseText(raw);
        if (!result.ok) throw new Error('expected parseHttpResponseText to succeed');
        if (!result.bodyIsJson) throw new Error('expected the body to be recognized as JSON');
        return JSON.stringify(JSON.parse(result.bodyPretty)) === JSON.stringify(value);
      }),
    );
  });
});

describe('parseHttpResponseText fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseHttpResponseText(raw), fc.string());
  });
});
