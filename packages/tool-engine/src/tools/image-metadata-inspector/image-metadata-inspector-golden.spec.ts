import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePngIhdr } from "./png-header.js";

describe('independent image golden corpus', () => {
  it('reads the IHDR values of a Pillow-generated real PNG', () => {
    const bytes = readFileSync(resolve(process.cwd(), 'packages/tool-engine/src/tools/image-metadata-inspector/__fixtures__/golden-rgb.png'));

    expect(parsePngIhdr(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))).toEqual({
      width: 37,
      height: 23,
      bitDepth: 8,
      colorType: 2,
      colorTypeName: 'Truecolor (RGB)',
      interlaced: false,
    });
  });
});
