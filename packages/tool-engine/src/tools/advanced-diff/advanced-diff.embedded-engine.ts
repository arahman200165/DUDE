import { DiffLineType } from "../diff/text-diff.js";
import { DiffSegmentType } from "./char-word-diff.js";
export const LINE_CLASSES: Record<DiffLineType, string> = {
    add: 'bg-success/10 text-success',
    remove: 'bg-error/10 text-error',
    equal: 'text-text-muted',
};
/** Fixed-width gutter markers, so added/removed lines read without color. */
export const LINE_MARKER: Record<DiffLineType, string> = { add: '+', remove: '−', equal: '' };
export const SEGMENT_CLASSES: Record<DiffSegmentType, string> = {
    add: 'bg-success/30 text-text underline',
    remove: 'bg-error/30 text-text line-through',
    equal: '',
};
export function AdvancedDiff_lineClasses(type: DiffLineType): string {
    return LINE_CLASSES[type];
}
export function AdvancedDiff_lineMarker(type: DiffLineType): string {
    return LINE_MARKER[type];
}
export function AdvancedDiff_segmentClasses(type: DiffSegmentType): string {
    return SEGMENT_CLASSES[type];
}
