export type AdvancedDiffImageResult =
  | {
      readonly ok: true;
      readonly diffPng: ArrayBuffer;
      readonly width: number;
      readonly height: number;
      readonly diffPixelCount: number;
      readonly totalPixels: number;
      readonly diffPercentage: number;
    }
  | { readonly ok: false; readonly error: string };
