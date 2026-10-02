import { scanFileList, scanNativeEntries, ScannedFile } from "./directory-tree-scan.js";
import { DirectoryDiffFileEntry, DirectoryDiffPayload, EntryStatus, TreeDiffEntry } from "./directory-tree-diff.js";
import { bytesToHexSpaced } from "../../shared/utils/byte-codec.js";
import { computeLineDiff, DiffLineType, DiffResult } from "../diff/text-diff.js";
export const LINE_CLASSES: Record<DiffLineType, string> = {
    add: 'bg-success/10 text-success',
    remove: 'bg-error/10 text-error',
    equal: 'text-text-muted',
};
export const LINE_PREFIX: Record<DiffLineType, string> = { add: '+ ', remove: '- ', equal: '  ' };
export async function DirectoryDiff_buildPayloadEntries(files: readonly ScannedFile[]): Promise<DirectoryDiffFileEntry[]> {
    return Promise.all(files.map(async (scanned) => {
        const buffer = await scanned.read();
        return { path: scanned.path, size: buffer.byteLength, buffer };
    }));
}
export function DirectoryDiff_hex(bytes: Uint8Array | null): string {
    return bytes ? bytesToHexSpaced(bytes) : '';
}
export function DirectoryDiff_lineClasses(type: DiffLineType): string {
    return LINE_CLASSES[type];
}
export function DirectoryDiff_linePrefix(type: DiffLineType): string {
    return LINE_PREFIX[type];
}
export function DirectoryDiff_chunkRowClasses(equal: boolean): string {
    return equal ? '' : 'bg-error/10';
}
