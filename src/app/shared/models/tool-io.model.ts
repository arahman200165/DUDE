/**
 * Shared vocabulary a tool declares its inputs/outputs in terms of, per DUDE_PRD.md §21 Phase 21's
 * "Universal Input/Output Contract" item. Declarative documentation only, like `persistence`/
 * `execution`/`network` on ToolDefinition -- not read by the shell at runtime. It exists so tools
 * agree on a common shape before anything (pipelines, Smart Paste) is built on top of it.
 */
export type DudeDataType =
  | 'text' // plain UTF-8 string
  | 'json' // structured JSON value (object/array/primitive)
  | 'bytes' // binary/Base64 payload without file metadata
  | 'file' // a File/Blob carrying a name + MIME type
  | 'table' // { columns, rows } tabular data
  | 'url' // a URL/URI string
  | 'http-response'; // a parsed HTTP response (status/headers/body) — first produced by HTTP Response Viewer

export interface ToolIOCapabilities {
  readonly accepts: readonly DudeDataType[];
  readonly produces: readonly DudeDataType[];
}

export const DUDE_DATA_TYPES: readonly DudeDataType[] = ['text', 'json', 'bytes', 'file', 'table', 'url', 'http-response'];
