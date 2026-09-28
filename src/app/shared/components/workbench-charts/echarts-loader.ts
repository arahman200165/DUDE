import type * as echarts from 'echarts/core';

/**
 * One-time, dynamically-imported ECharts registration (DUDE_PRD.md §21 Phase 30C.3) — only the
 * Canvas renderer plus the line/bar chart types and grid/tooltip components are pulled in (a
 * custom tree-shaken build via `echarts/core`, not the full `echarts` bundle), and only on first
 * use, so no tool or shell chunk pays for it unless a chart primitive actually renders.
 */
let corePromise: Promise<typeof echarts> | null = null;

export function loadEcharts(): Promise<typeof echarts> {
  if (!corePromise) {
    corePromise = (async () => {
      const [core, { CanvasRenderer }, { LineChart, BarChart }, { GridComponent, TooltipComponent }] = await Promise.all([
        import('echarts/core'),
        import('echarts/renderers'),
        import('echarts/charts'),
        import('echarts/components'),
      ]);
      core.use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent]);
      return core;
    })();
  }
  return corePromise;
}

/** Reads a design token as a plain CSS color string ECharts can consume directly. */
export function readColorToken(name: string): string {
  if (typeof window === 'undefined') return '#8b93a3';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8b93a3';
}
