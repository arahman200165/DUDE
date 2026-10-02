import jsQR from 'jsqr';

/** Pure, framework-free wrapper around `jsqr`'s decode call. */

export interface QrScanResult {
  readonly data: string;
}

export function decodeQrFromImageData(imageData: ImageData): QrScanResult | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return result ? { data: result.data } : null;
}
