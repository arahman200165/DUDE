/**
 * Pure dimension math for the Image Resizer -- kept separate from the
 * component so the aspect-ratio-lock/percentage-scale logic is testable
 * without a canvas.
 */

export interface ResizeInput {
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly mode: 'dimensions' | 'percent';
  readonly targetWidth?: number;
  readonly targetHeight?: number;
  readonly percent?: number;
  readonly lockAspect: boolean;
}

export interface ResizeOutput {
  readonly width: number;
  readonly height: number;
}

export function computeResizedDimensions(input: ResizeInput): ResizeOutput {
  const { originalWidth, originalHeight } = input;
  if (originalWidth <= 0 || originalHeight <= 0) return { width: 0, height: 0 };

  if (input.mode === 'percent') {
    const percent = Math.max(1, input.percent ?? 100);
    return {
      width: Math.max(1, Math.round((originalWidth * percent) / 100)),
      height: Math.max(1, Math.round((originalHeight * percent) / 100)),
    };
  }

  const aspect = originalWidth / originalHeight;
  const width = input.targetWidth;
  const height = input.targetHeight;

  if (!input.lockAspect) {
    return {
      width: Math.max(1, Math.round(width ?? originalWidth)),
      height: Math.max(1, Math.round(height ?? originalHeight)),
    };
  }

  // Aspect-locked: whichever dimension was most recently/explicitly given drives the other.
  if (width !== undefined && height === undefined) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(width / aspect)) };
  }
  if (height !== undefined && width === undefined) {
    return { width: Math.max(1, Math.round(height * aspect)), height: Math.max(1, Math.round(height)) };
  }
  if (width !== undefined && height !== undefined) {
    // Both given: prefer width as the driver for a deterministic result.
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(width / aspect)) };
  }
  return { width: originalWidth, height: originalHeight };
}
