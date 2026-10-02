/**
 * Pure geometry for the Image Cropper: turning two pointer positions (in the
 * rendered `<img>`'s displayed pixel space, which may be scaled down from
 * the image's natural size) into a clamped crop rectangle in natural pixels.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function rectFromPoints(a: Point, b: Point): CropRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Scales a displayed-space rect up to the image's natural pixel space. */
export function scaleRectToNatural(rect: CropRect, displayedWidth: number, displayedHeight: number, naturalWidth: number, naturalHeight: number): CropRect {
  if (displayedWidth <= 0 || displayedHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scaleX = naturalWidth / displayedWidth;
  const scaleY = naturalHeight / displayedHeight;
  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

/** Clamps a natural-space crop rect so it never extends outside the image bounds. */
export function clampCropRect(rect: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const x = Math.max(0, Math.min(rect.x, imageWidth));
  const y = Math.max(0, Math.min(rect.y, imageHeight));
  const width = Math.max(0, Math.min(rect.width, imageWidth - x));
  const height = Math.max(0, Math.min(rect.height, imageHeight - y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
