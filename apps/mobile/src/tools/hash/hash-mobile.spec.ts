import { describe, expect, it } from 'vitest';
import { buildHashRows, hexToBase64, HASH_ORDER, UNAVAILABLE_TEXT } from './hash-mobile';

describe('hash mobile helpers', () => {
  it('converts a hex digest to padded base64', () => {
    // sha256("abc") computed with node:crypto
    expect(hexToBase64('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
    expect(hexToBase64('')).toBe('');
    expect(hexToBase64('66')).toBe('Zg==');
  });
  it('builds one row per algorithm and marks the WebAssembly ones unavailable', () => {
    const rows = buildHashRows(new Map([['SHA-256', 'ba78'], ['MD5', '9001']]), 'hex');
    expect(rows.map(row => row.key)).toEqual([...HASH_ORDER]);
    expect(rows.find(row => row.key === 'SHA-256')?.value).toBe('ba78');
    expect(rows.find(row => row.key === 'XXH32')?.value).toBe(UNAVAILABLE_TEXT);
    expect(rows.find(row => row.key === 'XXH64')?.value).toBe(UNAVAILABLE_TEXT);
  });
});
