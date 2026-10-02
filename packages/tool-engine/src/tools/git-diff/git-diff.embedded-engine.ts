import { DiffLineType, DiffResult } from "../diff/text-diff.js";
export const LINE_CLASSES: Record<DiffLineType, string> = {
    add: 'bg-success/10 text-success',
    remove: 'bg-error/10 text-error',
    equal: 'text-text-muted',
};
export const LINE_PREFIX: Record<DiffLineType, string> = { add: '+ ', remove: '- ', equal: '  ' };
export function GitDiff_lineClasses(type: DiffLineType): string {
    return LINE_CLASSES[type];
}
export function GitDiff_linePrefix(type: DiffLineType): string {
    return LINE_PREFIX[type];
}
