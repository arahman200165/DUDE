import type { LineMatch } from "../../shared/fs/text-search.js";
export interface ContentHit {
    readonly path: string;
    readonly size: number;
    readonly encoding: string;
    readonly total: number;
    readonly matches: readonly LineMatch[];
}
export function TreeSearchTool_matchId(hit: ContentHit, match: LineMatch): string { return `${hit.path}#${match.line}:${match.column}`; }
export function TreeSearchTool_segments(match: LineMatch): {
    before: string;
    hit: string;
    after: string;
} {
    return { before: match.text.slice(0, match.textColumn), hit: match.text.slice(match.textColumn, match.textColumn + match.length), after: match.text.slice(match.textColumn + match.length) };
}
export function TreeSearchTool_list(value: string): string[] { return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean); }
export function TreeSearchTool_metaDate(mtimeMs: number): string { return new Date(mtimeMs).toISOString().slice(0, 10); }
