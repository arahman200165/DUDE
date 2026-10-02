import { computeReadability, readingEaseLabel } from "./readability.js";
export function TextInspector_readingEaseLabel(score: number): string {
    return readingEaseLabel(score);
}
