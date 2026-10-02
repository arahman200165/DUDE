// Global vitest setup (wired via angular.json's test.options.setupFiles) — fixes fast-check's
// seed and run count so every property test in the suite is deterministic across machines and CI.
import fc from 'fast-check';
import '../app/core/platform/engine-host.adapter';
import { stubCanvasRenderingContext } from '../app/shared/components/workbench-charts/testing/stub-canvas-context';

fc.configureGlobal({ seed: 20260923, numRuns: 200 });

// jsdom has no real canvas 2D context — see the stub's own doc comment. Installed globally
// because any spec that renders Deck also renders `HomeActivityPanel`'s charts, not just specs
// that mount a chart component directly.
stubCanvasRenderingContext();
