export interface KeyframeStop {
  readonly percent: number;
  /**
   * Raw CSS declarations for this stop (e.g. `transform: scale(1); opacity: 1;`),
   * not a per-property form -- a deliberate scope cut. Building a dedicated
   * control for every animatable property at every stop is a much bigger UI
   * surface than the value justifies here; a free-form field covers the same
   * ground and is what most people reach for when hand-writing @keyframes anyway.
   */
  readonly declarations: string;
}

export interface AnimationSettings {
  readonly name: string;
  readonly durationSeconds: number;
  readonly timingFunction: string;
  readonly delaySeconds: number;
  readonly iterationCount: string;
  readonly direction: string;
}

export const DEFAULT_STOPS: readonly KeyframeStop[] = [
  { percent: 0, declarations: 'transform: scale(1); opacity: 1;' },
  { percent: 50, declarations: 'transform: scale(1.2); opacity: 0.7;' },
  { percent: 100, declarations: 'transform: scale(1); opacity: 1;' },
];

export const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  name: 'pulse',
  durationSeconds: 1.5,
  timingFunction: 'ease-in-out',
  delaySeconds: 0,
  iterationCount: 'infinite',
  direction: 'normal',
};

export function buildKeyframesBlock(name: string, stops: readonly KeyframeStop[]): string {
  const sorted = [...stops].sort((a, b) => a.percent - b.percent);
  const body = sorted.map((s) => `  ${s.percent}% { ${s.declarations.trim()} }`).join('\n');
  return `@keyframes ${name} {\n${body}\n}`;
}

/** Standard shorthand order: name duration timing-function delay iteration-count direction. */
export function buildAnimationDeclaration(settings: AnimationSettings): string {
  return `animation: ${settings.name} ${settings.durationSeconds}s ${settings.timingFunction} ${settings.delaySeconds}s ${settings.iterationCount} ${settings.direction};`;
}

export function buildFullCss(settings: AnimationSettings, stops: readonly KeyframeStop[]): string {
  return `${buildKeyframesBlock(settings.name, stops)}\n\n.animated {\n  ${buildAnimationDeclaration(settings)}\n}`;
}
