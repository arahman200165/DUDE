/**
 * Parses the PNG IHDR chunk directly from bytes -- the one format where
 * bit-depth/color-type facts are cheap to read from a fixed header offset
 * without a full decode. Other formats (JPEG/WebP/GIF/BMP) get their pixel
 * dimensions from the browser's own decoder (`createImageBitmap`, in the
 * component) instead; this file intentionally stays PNG-only.
 */

export interface PngIhdr {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly colorTypeName: string;
  readonly interlaced: boolean;
}

const COLOR_TYPE_NAMES: Record<number, string> = {
  0: 'Grayscale',
  2: 'Truecolor (RGB)',
  3: 'Indexed (palette)',
  4: 'Grayscale + alpha',
  6: 'Truecolor + alpha (RGBA)',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32BE(bytes: Uint8Array, offset: number): number {
  // `>>> 0` forces an unsigned interpretation -- without it, values with the high bit set
  // (width/height >= 0x80000000) come back negative because `<<`/`|` operate on signed int32.
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

export function parsePngIhdr(bytes: Uint8Array): PngIhdr | null {
  if (bytes.length < 33) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  // Bytes 8-11: IHDR chunk length (always 13); bytes 12-15: 'IHDR'; IHDR data starts at byte 16.
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunkType !== 'IHDR') return null;

  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlaced = bytes[28] === 1;

  return {
    width,
    height,
    bitDepth,
    colorType,
    colorTypeName: COLOR_TYPE_NAMES[colorType] ?? `Unknown (${colorType})`,
    interlaced,
  };
}
