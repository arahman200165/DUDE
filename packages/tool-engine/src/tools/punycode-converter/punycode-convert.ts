import { toASCII, toUnicode } from 'punycode';

export type PunycodeDirection = 'toASCII' | 'toUnicode';

export type PunycodeResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export function convertPunycode(input: string, direction: PunycodeDirection): PunycodeResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a domain name.' };

  try {
    const value = direction === 'toASCII' ? toASCII(trimmed) : toUnicode(trimmed);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid input for Punycode conversion.' };
  }
}
