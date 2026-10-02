import { HexDumpParseResult } from "./hex-dump-codec.js";

export type HexDumpWorkerPayload =
  | { readonly direction: 'toHexDump'; readonly buffer: ArrayBuffer }
  | { readonly direction: 'toFile'; readonly dump: string };

export type HexDumpWorkerResult =
  | { readonly direction: 'toHexDump'; readonly dump: string }
  | { readonly direction: 'toFile'; readonly parsed: HexDumpParseResult };
