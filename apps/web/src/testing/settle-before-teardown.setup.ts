// Global vitest setup (wired via angular.json's test.options.setupFiles). Angular's unit-test builder
// runs Vitest with `isolate: false`, so a lazy chunk a test leaves loading (an `@defer` block, a
// router `loadComponent`, a Home panel) keeps loading into the next spec file, and a fetch still
// pending when the worker shuts down fails as `EnvironmentTeardownError` against whichever file ran
// last in that worker. Before Angular's own cleanup destroys the fixtures, wait (bounded) for the
// app to be stable, which covers every load that is a `PendingTasks` task.
import { ApplicationRef } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';

const SETTLE_LIMIT_MS = 1000;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

// Hooks run in reverse registration order, and this file registers after the builder's TestBed
// cleanup hook, so this runs first, while the fixtures are still alive.
afterEach(async () => {
  // Only a test that created a fixture can have a component still loading; `_activeFixtures` is
  // TestBed's own list, read here so a test that never touched TestBed is not given a module.
  const fixtures = (getTestBed() as unknown as { _activeFixtures?: readonly unknown[] })._activeFixtures;
  if (!fixtures?.length || vi.isFakeTimers()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    getTestBed().inject(ApplicationRef).whenStable(),
    new Promise<void>((resolve) => (timer = realSetTimeout(resolve, SETTLE_LIMIT_MS))),
  ]);
  realClearTimeout(timer);
});
