import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTar } from "./archive-tool-tar.js";
import { extractZip } from "./archive-tool-zip.js";

const FIXTURES = 'packages/tool-engine/src/tools/archive-tool/__fixtures__';
const EXPECTED = [
  { name: 'README.txt', text: 'Independent archive corpus\n' },
  { name: 'docs/hello.txt', text: 'Hello from a Python-created ZIP and TAR fixture.\n' },
];

function assertEntries(entries: readonly { name: string; data: Uint8Array }[]): void {
  expect(entries.map(({ name }) => name)).toEqual(EXPECTED.map(({ name }) => name));
  expect(entries.map(({ data }) => new TextDecoder().decode(data))).toEqual(EXPECTED.map(({ text }) => text));
}

describe('independent archive golden corpus', () => {
  it('extracts known paths and exact contents from a Python zipfile archive', () => {
    const bytes = readFileSync(resolve(process.cwd(), FIXTURES, 'independent.zip'));
    assertEntries(extractZip(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
  });

  it('extracts known paths and exact contents from a Python tarfile USTAR archive', () => {
    const bytes = readFileSync(resolve(process.cwd(), FIXTURES, 'independent.tar'));
    assertEntries(extractTar(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
  });
});
