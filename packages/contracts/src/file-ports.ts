/** Read-only file facilities supplied by an upload adapter or a native file adapter. */
export interface ReadableFilePort {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}
export type ReadableFileListPort = ArrayLike<ReadableFilePort>;
