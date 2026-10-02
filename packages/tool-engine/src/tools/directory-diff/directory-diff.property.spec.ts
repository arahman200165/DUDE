import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { diffDirectoryPayload, DirectoryDiffFileEntry } from "./directory-tree-diff.js";

function toEntry(path: string, bytes: readonly number[]): DirectoryDiffFileEntry {
  const buffer = new Uint8Array(bytes).buffer;
  return { path, size: buffer.byteLength, buffer };
}

const fileArb = fc.tuple(fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !s.includes('\n')), fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 32 }));

describe('diffDirectoryPayload (pure core) fuzzing', () => {
  it('never throws/rejects for arbitrary file lists', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fileArb, { maxLength: 8 }), fc.array(fileArb, { maxLength: 8 }), async (leftFiles, rightFiles) => {
        const left = leftFiles.map(([path, bytes]) => toEntry(path, bytes));
        const right = rightFiles.map(([path, bytes]) => toEntry(path, bytes));
        await diffDirectoryPayload({ left, right });
      }),
      { numRuns: 50 },
    );
  });

  it('diffing a payload against an identical copy of itself reports every entry as unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fileArb, { maxLength: 8 }), async (files) => {
        const left = files.map(([path, bytes]) => toEntry(path, bytes));
        const right = files.map(([path, bytes]) => toEntry(path, bytes));
        const result = await diffDirectoryPayload({ left, right });

        expect(result.every((entry) => entry.status === 'unchanged')).toBe(true);
        expect(result).toHaveLength(new Set(files.map(([path]) => path)).size);
      }),
      { numRuns: 50 },
    );
  });
});
