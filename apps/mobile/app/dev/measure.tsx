import { lazy, Suspense } from 'react';

/**
 * Measurement harness route (dude://dev/measure). Compiled in only when EXPO_PUBLIC_DUDE_MEASURE=1 at build time: Expo inlines the
 * variable, Metro folds the constant condition away and the lazy import() (with the measurement module and its task imports) is
 * dropped from every normal build, where this route renders nothing. scripts/check-mobile-bundle.mjs proves the module is absent.
 */
const MeasureRunner = process.env.EXPO_PUBLIC_DUDE_MEASURE === '1' ? lazy(() => import('../../src/tools/_measure/measure-runner')) : null;

export default function MeasureRoute() {
  if (!MeasureRunner) return null;
  return <Suspense fallback={null}><MeasureRunner /></Suspense>;
}
