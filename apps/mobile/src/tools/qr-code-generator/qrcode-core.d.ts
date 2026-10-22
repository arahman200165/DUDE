/** Types for the `qrcode` core encoder (pure JS, no canvas or Node renderer), which ships no declarations for this path. */
declare module 'qrcode/lib/core/qrcode' {
  export interface QrBitMatrix { readonly size: number; get(row: number, col: number): number }
  export interface QrSymbol { readonly modules: QrBitMatrix; readonly version: number }
  export function create(text: string, options?: { readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): QrSymbol;
}
