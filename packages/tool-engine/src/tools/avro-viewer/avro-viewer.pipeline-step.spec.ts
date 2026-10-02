import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./avro-viewer.pipeline-step.js";

function zigzagEncode(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}
function encodeVarint(n: number): number[] {
  const bytes: number[] = [];
  let value = n;
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return bytes;
}
function encodeLong(n: number): number[] {
  return encodeVarint(zigzagEncode(n));
}
function encodeBytesRaw(bytes: readonly number[]): number[] {
  return [...encodeLong(bytes.length), ...bytes];
}
function encodeString(value: string): number[] {
  return encodeBytesRaw(Array.from(new TextEncoder().encode(value)));
}
const SYNC_MARKER = Array.from({ length: 16 }, (_, i) => i);
function buildAvroFile(schema: unknown, encodedRecords: readonly number[][]): Uint8Array {
  const metadata = [
    ...encodeLong(2),
    ...encodeString('avro.schema'),
    ...encodeBytesRaw(Array.from(new TextEncoder().encode(JSON.stringify(schema)))),
    ...encodeString('avro.codec'),
    ...encodeBytesRaw(Array.from(new TextEncoder().encode('null'))),
    ...encodeLong(0),
  ];
  const recordBytes = encodedRecords.flat();
  const block = [...encodeLong(encodedRecords.length), ...encodeLong(recordBytes.length), ...recordBytes, ...SYNC_MARKER];
  return new Uint8Array([0x4f, 0x62, 0x6a, 0x01, ...metadata, ...SYNC_MARKER, ...block]);
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('avro-viewer pipeline step', () => {
  const schema = { type: 'record', name: 'User', fields: [{ name: 'name', type: 'string' }] };
  const file = buildAvroFile(schema, [encodeString('Alice')]);

  it('decodes a bytes value (base64) into schema + records json', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: bytesToBase64(file) });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { schema, records: [{ name: 'Alice' }] } } });
  });

  it('decodes a file value into schema + records json', async () => {
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'data.avro', mimeType: 'application/octet-stream', base64: bytesToBase64(file) },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toEqual({ type: 'json', value: { schema, records: [{ name: 'Alice' }] } });
  });

  it('fails on a file with the wrong magic bytes', async () => {
    const result = await pipelineStep.run({ type: 'bytes', value: bytesToBase64(new Uint8Array([1, 2, 3, 4, 5])) });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'Avro Viewer expects file or bytes input.', kind: 'invalid-input' } });
  });
});
