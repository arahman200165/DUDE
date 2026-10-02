/** Standard WebCrypto/Fetch/Streams shapes are supplied by the host, never discovered by engines. */
export interface EngineHostPorts {
  readonly crypto: () => Crypto;
  readonly request: typeof fetch;
  readonly compression: (format: CompressionFormat, decompress: boolean) => CompressionStream | DecompressionStream;
  readonly sanitizeHtml: (html: string) => string;
  readonly htmlEntities: (input: string, mode: 'encode' | 'decode') => string;
  readonly decodeImage: (bytes: Uint8Array, mime: string) => Promise<{ readonly width: number; readonly height: number; close?(): void }>;
  readonly xxhash: () => Promise<XxhashPort>;
}
export interface XxhashPort {
  h32Raw(bytes: Uint8Array): number;
  h64Raw(bytes: Uint8Array): bigint;
  create32(): { update(bytes: Uint8Array): unknown; digest(): number };
  create64(): { update(bytes: Uint8Array): unknown; digest(): bigint };
}
