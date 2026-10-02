/**
 * Pure, framework-free `hexdump -C`-style formatter/parser: 8-digit offset,
 * 16 bytes per line (split into two groups of 8), trailing |ASCII| gutter,
 * plus a final offset-only line marking the total length.
 */

const BYTES_PER_LINE = 16;

export function formatHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BYTES_PER_LINE) {
    const chunk = bytes.subarray(offset, offset + BYTES_PER_LINE);
    const firstHalf: string[] = [];
    const secondHalf: string[] = [];

    for (let i = 0; i < BYTES_PER_LINE; i++) {
      const hex = i < chunk.length ? chunk[i].toString(16).padStart(2, '0') : '  ';
      (i < 8 ? firstHalf : secondHalf).push(hex);
    }

    const ascii = Array.from(chunk, (byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${firstHalf.join(' ')}  ${secondHalf.join(' ')}  |${ascii}|`);
  }

  lines.push(bytes.length.toString(16).padStart(8, '0'));
  return lines.join('\n');
}

export type HexDumpParseResult = { readonly ok: true; readonly value: Uint8Array } | { readonly ok: false; readonly error: string };

/** Parses this tool's own `formatHexDump` output (offset + hex + optional |ASCII| gutter) back into bytes. */
export function parseHexDump(input: string): HexDumpParseResult {
  const bytes: number[] = [];

  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;

    const withoutOffset = line.replace(/^[0-9a-fA-F]+\s*/, '');
    const hexPortion = withoutOffset.split('|')[0];
    const tokens = hexPortion.trim().split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      if (!/^[0-9a-fA-F]{1,2}$/.test(token)) return { ok: false, error: `"${token}" is not a valid hex byte.` };
      bytes.push(parseInt(token, 16));
    }
  }

  return { ok: true, value: Uint8Array.from(bytes) };
}
