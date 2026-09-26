import { FileSignature } from '../../shared/utils/file-signatures';

/** Everything a detector or the ranking function needs, already computed once per drop. */
export interface FileDropContext {
  readonly fileName: string;
  readonly declaredMime: string;
  readonly sniffed: FileSignature | null;
  readonly containerFormat: string | null;
}

/** Mirrors `PasteDetector`'s shape — a thin `test(context): number | null` wrapper, never a parser. */
export interface FileDropDetector {
  readonly toolId: string;
  test(context: FileDropContext): number | null;
}

export interface FileDropMatch {
  readonly toolId: string;
  readonly title: string;
  readonly score: number;
  readonly reason: string;
}
