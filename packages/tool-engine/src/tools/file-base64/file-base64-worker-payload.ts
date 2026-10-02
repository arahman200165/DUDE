import { FileBase64DecodeResult } from "./file-base64-codec.js";

export type FileBase64WorkerPayload =
  | { readonly direction: 'encode'; readonly buffer: ArrayBuffer }
  | { readonly direction: 'decode'; readonly base64: string };

export type FileBase64WorkerResult =
  | { readonly direction: 'encode'; readonly base64: string }
  | { readonly direction: 'decode'; readonly decoded: FileBase64DecodeResult };
