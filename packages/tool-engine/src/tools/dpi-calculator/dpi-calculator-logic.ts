export type LengthUnit = 'in' | 'cm' | 'mm';

const INCHES_PER_UNIT: Record<LengthUnit, number> = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4 };

export function toInches(value: number, unit: LengthUnit): number {
  return value * INCHES_PER_UNIT[unit];
}

export function fromInches(valueInInches: number, unit: LengthUnit): number {
  return valueInInches / INCHES_PER_UNIT[unit];
}

export interface DpiResult {
  readonly horizontalDpi: number;
  readonly verticalDpi: number;
}

export function computeDpi(pixelWidth: number, pixelHeight: number, physicalWidth: number, physicalHeight: number, unit: LengthUnit): DpiResult {
  const widthInches = toInches(physicalWidth, unit);
  const heightInches = toInches(physicalHeight, unit);
  return {
    horizontalDpi: widthInches > 0 ? pixelWidth / widthInches : 0,
    verticalDpi: heightInches > 0 ? pixelHeight / heightInches : 0,
  };
}

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export function computePixelsForDpi(physicalWidth: number, physicalHeight: number, unit: LengthUnit, dpi: number): PixelSize {
  return { width: Math.round(toInches(physicalWidth, unit) * dpi), height: Math.round(toInches(physicalHeight, unit) * dpi) };
}

export interface PhysicalSize {
  readonly width: number;
  readonly height: number;
}

export function computePhysicalSizeForDpi(pixelWidth: number, pixelHeight: number, dpi: number, unit: LengthUnit): PhysicalSize {
  if (dpi <= 0) return { width: 0, height: 0 };
  return { width: fromInches(pixelWidth / dpi, unit), height: fromInches(pixelHeight / dpi, unit) };
}
