import budget from './perf-budget.json';
import { buildBinary } from './perf-fixtures';
import { diffDirectoryPayload, DirectoryDiffFileEntry } from "@dude/tool-engine/tools/directory-diff/directory-tree-diff";

const FILE_COUNT_PER_SIDE = 2_000;
const FILE_SIZE = 1_024;

function buildDirectoryPair(): { left: DirectoryDiffFileEntry[]; right: DirectoryDiffFileEntry[] } {
  const left: DirectoryDiffFileEntry[] = [];
  const right: DirectoryDiffFileEntry[] = [];
  for (let index = 0; index < FILE_COUNT_PER_SIDE; index++) {
    const path = `folder-${Math.floor(index / 100)}/file-${String(index).padStart(4, '0')}.bin`;
    const original = buildBinary(FILE_SIZE, index);
    const buffer = original.buffer as ArrayBuffer;
    if (index < 125) {
      left.push({ path, size: FILE_SIZE, buffer });
    } else {
      left.push({ path, size: FILE_SIZE, buffer });
      if (index < 375) {
        const changed = original.slice();
        changed[0] ^= 0xff;
        right.push({ path, size: FILE_SIZE, buffer: changed.buffer as ArrayBuffer });
      } else {
        right.push({ path, size: FILE_SIZE, buffer });
      }
    }
  }
  for (let index = FILE_COUNT_PER_SIDE; index < FILE_COUNT_PER_SIDE + 125; index++) {
    const path = `folder-${Math.floor(index / 100)}/file-${String(index).padStart(4, '0')}.bin`;
    const bytes = buildBinary(FILE_SIZE, index);
    right.push({ path, size: FILE_SIZE, buffer: bytes.buffer as ArrayBuffer });
  }
  return { left, right };
}

describe('directory tree diff performance', () => {
  it(`compares two 2,000-file trees in under ${budget.directoryDiff2kFiles}ms`, async () => {
    const payload = buildDirectoryPair();

    const start = performance.now();
    const result = await diffDirectoryPayload(payload);
    const durationMs = performance.now() - start;
    const counts = result.reduce<Record<string, number>>((all, entry) => {
      all[entry.status] = (all[entry.status] ?? 0) + 1;
      return all;
    }, {});

    console.log(`diffDirectoryPayload(2k files/side, 1KB each): ${durationMs.toFixed(1)}ms (budget ${budget.directoryDiff2kFiles}ms)`);
    expect(result).toHaveLength(FILE_COUNT_PER_SIDE + 125);
    expect(counts.unchanged).toBe(FILE_COUNT_PER_SIDE - 375);
    expect(counts.changed).toBe(250);
    expect(counts.removed).toBe(125);
    expect(counts.added).toBe(125);
    expect(durationMs).toBeLessThan(budget.directoryDiff2kFiles);
  });
});
