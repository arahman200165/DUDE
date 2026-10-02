/** A minimal DER encoder: just enough ASN.1 to build an X.509 v3 certificate. */

export function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let n = length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

export const sequence = (...items: Buffer[]): Buffer => tlv(0x30, Buffer.concat(items));
export const set = (...items: Buffer[]): Buffer => tlv(0x31, Buffer.concat(items));

export function boolean(value: boolean): Buffer {
  return tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
}

/** INTEGER from big-endian unsigned magnitude bytes (minimal encoding, positive). */
export function integer(magnitude: Buffer): Buffer {
  let start = 0;
  while (start < magnitude.length - 1 && magnitude[start] === 0) start++;
  let body = magnitude.subarray(start);
  if (body.length === 0) body = Buffer.from([0]);
  if (body[0] & 0x80) body = Buffer.concat([Buffer.from([0]), body]);
  return tlv(0x02, body);
}

export function integerFromNumber(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) throw new Error('integerFromNumber expects a non-negative integer');
  const bytes: number[] = [];
  for (let n = value; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
  return integer(Buffer.from(bytes.length ? bytes : [0]));
}

export function oid(dotted: string): Buffer {
  const arcs = dotted.split('.').map(Number);
  if (arcs.length < 2 || arcs.some((a) => !Number.isInteger(a) || a < 0)) throw new Error(`Invalid OID ${dotted}`);
  const out: number[] = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const chunk: number[] = [arc & 0x7f];
    for (let n = Math.floor(arc / 128); n > 0; n = Math.floor(n / 128)) chunk.unshift((n & 0x7f) | 0x80);
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

export const utf8String = (text: string): Buffer => tlv(0x0c, Buffer.from(text, 'utf8'));
export const printableString = (text: string): Buffer => {
  if (!/^[A-Za-z0-9 '()+,\-./:=?]*$/.test(text)) throw new Error('Not a PrintableString');
  return tlv(0x13, Buffer.from(text, 'ascii'));
};
export const ia5String = (text: string): Buffer => tlv(0x16, Buffer.from(text, 'ascii'));

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

export function utcTime(date: Date): Buffer {
  const y = date.getUTCFullYear();
  if (y < 1950 || y > 2049) throw new Error('UTCTime covers 1950-2049 only');
  const text = `${pad(y % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(text, 'ascii'));
}

export function generalizedTime(date: Date): Buffer {
  const text = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x18, Buffer.from(text, 'ascii'));
}

/** RFC 5280 section 4.1.2.5: UTCTime through 2049, GeneralizedTime from 2050. */
export const x509Time = (date: Date): Buffer => (date.getUTCFullYear() >= 2050 ? generalizedTime(date) : utcTime(date));

export const bitString = (content: Buffer, unusedBits = 0): Buffer => tlv(0x03, Buffer.concat([Buffer.from([unusedBits]), content]));
export const octetString = (content: Buffer): Buffer => tlv(0x04, content);

/** `[n] EXPLICIT` constructed wrapper. */
export const contextExplicit = (n: number, inner: Buffer): Buffer => tlv(0xa0 | n, inner);
/** `[n] IMPLICIT` primitive (e.g. GeneralName dNSName / iPAddress). */
export const contextImplicit = (n: number, content: Buffer): Buffer => tlv(0x80 | n, content);
