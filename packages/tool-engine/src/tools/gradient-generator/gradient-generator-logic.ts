export type GradientType = 'linear' | 'radial' | 'conic';
export type RadialShape = 'circle' | 'ellipse';

export interface GradientStop {
  readonly color: string;
  readonly position: number;
}

export interface GradientOptions {
  readonly type: GradientType;
  readonly angle: number;
  readonly shape: RadialShape;
  readonly stops: readonly GradientStop[];
}

export type GradientResult = { readonly ok: true; readonly css: string } | { readonly ok: false; readonly error: string };

function stopsToCss(stops: readonly GradientStop[]): string {
  return [...stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');
}

export function buildGradientCss(options: GradientOptions): string {
  const stopsCss = stopsToCss(options.stops);
  switch (options.type) {
    case 'linear':
      return `linear-gradient(${options.angle}deg, ${stopsCss})`;
    case 'radial':
      return `radial-gradient(${options.shape} at center, ${stopsCss})`;
    case 'conic':
      return `conic-gradient(from ${options.angle}deg at center, ${stopsCss})`;
  }
}

export function generateGradient(options: GradientOptions): GradientResult {
  if (options.stops.length < 2) return { ok: false, error: 'Add at least two color stops.' };
  return { ok: true, css: buildGradientCss(options) };
}
