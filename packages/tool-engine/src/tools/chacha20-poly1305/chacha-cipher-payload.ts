import { ChachaDecryptResult, ChachaVariant } from "./chacha-cipher.js";

export type ChachaWorkerPayload =
  | { readonly op: 'encrypt'; readonly plaintext: string; readonly passphrase: string; readonly variant: ChachaVariant; readonly iterations: number }
  | { readonly op: 'decrypt'; readonly bundle: string; readonly passphrase: string };

export type ChachaWorkerResult =
  | { readonly op: 'encrypt'; readonly bundle: string }
  | { readonly op: 'decrypt'; readonly result: ChachaDecryptResult };
