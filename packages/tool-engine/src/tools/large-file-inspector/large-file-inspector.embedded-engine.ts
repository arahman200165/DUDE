
export interface TextFind {
    readonly line: number;
    readonly column: number;
    readonly offset: number;
    readonly length: number;
    readonly text: string;
    readonly textColumn: number;
}
export function LargeFileInspectorTool_segments(find: TextFind): {
    before: string;
    hit: string;
    after: string;
} {
    return { before: find.text.slice(0, find.textColumn), hit: find.text.slice(find.textColumn, find.textColumn + Math.max(1, find.length)), after: find.text.slice(find.textColumn + Math.max(1, find.length)) };
}
