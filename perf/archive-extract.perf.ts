import budget from './perf-budget.json';
import { buildBinary } from './perf-fixtures';
import { createZip, extractZip } from "@dude/tool-engine/tools/archive-tool/archive-tool-zip";
import { ArchiveEntry } from "@dude/tool-engine/tools/archive-tool/archive-tool-types";

const ARCHIVE_FILE_COUNT = 256;
const ARCHIVE_FILE_SIZE = 16 * 1024;

describe('archive extraction performance', () => {
  it(`extracts a ~4MB ZIP archive in under ${budget.archiveExtract4MbZip}ms`, () => {
    const entries: ArchiveEntry[] = Array.from({ length: ARCHIVE_FILE_COUNT }, (_, index) => ({
      name: `apps/web/src/module-${String(index).padStart(3, '0')}.bin`,
      data: buildBinary(ARCHIVE_FILE_SIZE, index),
    }));
    const archive = createZip(entries);

    const start = performance.now();
    const extracted = extractZip(archive);
    const durationMs = performance.now() - start;

    console.log(`extractZip(4MB, ${ARCHIVE_FILE_COUNT} files): ${durationMs.toFixed(1)}ms (budget ${budget.archiveExtract4MbZip}ms)`);
    expect(extracted).toHaveLength(ARCHIVE_FILE_COUNT);
    expect(extracted.reduce((total, entry) => total + entry.data.length, 0)).toBe(ARCHIVE_FILE_COUNT * ARCHIVE_FILE_SIZE);
    expect(durationMs).toBeLessThan(budget.archiveExtract4MbZip);
  });
});
