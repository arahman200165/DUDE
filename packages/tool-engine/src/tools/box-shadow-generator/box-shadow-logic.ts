export interface ShadowLayer {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: string;
  readonly inset: boolean;
}

export const DEFAULT_SHADOW_LAYER: ShadowLayer = { offsetX: 0, offsetY: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.35)', inset: false };

export function formatShadowLayer(layer: ShadowLayer): string {
  const parts = [`${layer.offsetX}px`, `${layer.offsetY}px`, `${layer.blur}px`, `${layer.spread}px`, layer.color];
  return `${layer.inset ? 'inset ' : ''}${parts.join(' ')}`;
}

/** `box-shadow`'s value only, e.g. `0px 4px 8px 0px rgba(0,0,0,0.35)` — an empty layer list is the valid value `none`. */
export function buildBoxShadowValue(layers: readonly ShadowLayer[]): string {
  return layers.length === 0 ? 'none' : layers.map(formatShadowLayer).join(', ');
}

export function buildBoxShadowDeclaration(layers: readonly ShadowLayer[]): string {
  return `box-shadow: ${buildBoxShadowValue(layers)};`;
}
