/**
 * jsdom implements `<canvas>` but not its 2D rendering context, so `getContext('2d')` returns
 * `null` there — which crashes ECharts/zrender (`SparklineChart`/`RankedBarsChart`) the moment any
 * spec mounts one of them and lets change detection run. A `Proxy` that accepts any property
 * get/set and answers every method call with a no-op is enough for zrender's paint loop to
 * complete without throwing; nothing here needs to draw a real pixel for a unit test. Installed
 * once, globally, from `src/testing/fast-check.setup.ts` — every spec in the suite may end up
 * rendering Deck (which mounts `HomeActivityPanel`), not just specs that mount a chart directly.
 */
export function stubCanvasRenderingContext(): void {
  const state: Record<string, unknown> = {};
  const context = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined });
      }
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });

  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
