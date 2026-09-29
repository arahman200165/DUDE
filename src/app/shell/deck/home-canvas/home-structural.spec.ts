import { ApplicationRef, Component, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { PANEL_DEFINITIONS } from '../../../core/registry/panel-definitions';
import { PANEL_DEFINITIONS_TOKEN } from '../../../core/registry/panel-registry.service';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';
import { UsageService } from '../../../core/usage/usage.service';
import { COMMAND_SOURCE, PaletteCommand } from '../../../shared/models/command-source.model';
import type { PanelDefinition } from '../../../shared/models/panel-definition.model';
import { ActivityTrendPanel } from '../../insights/activity-trend-panel/activity-trend-panel';
import { CategoryUsagePanel } from '../../insights/category-usage-panel/category-usage-panel';
import { HomeCanvas } from './home-canvas';

// Structural assertions for the Home shell contract (DUDE_PRD.md 30L.7). Canvas 2D is stubbed
// globally in src/testing/fast-check.setup.ts.

@Component({ selector: 'app-fixture-panel', template: `<p data-testid="fixture-panel">Fixture panel body</p>` })
class FixturePanel {}

/** A test-only panel kind: declared exactly like a manifest would, but never in the generated registry. */
const FIXTURE_KIND: PanelDefinition = {
  id: 'fixture-kind',
  title: 'Fixture kind',
  description: 'Test-only panel kind.',
  load: async () => FixturePanel,
  size: { minW: 3, minH: 2 },
  dataDependencies: [],
};

function configure(extra: readonly PanelDefinition[] = [], providers: Provider[] = []): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PlatformService, useValue: { isDesktop: () => false } },
      { provide: PANEL_DEFINITIONS_TOKEN, useValue: [...PANEL_DEFINITIONS, ...extra] },
      ...providers,
    ],
  });
}

const settle = async (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

/** Panels load via dynamic import; poll (bounded) until `done` holds rather than guessing a delay. */
async function until(fixture: { detectChanges(): void }, done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i++) {
    await settle(20);
    fixture.detectChanges();
  }
}

function render() {
  const fixture = TestBed.createComponent(HomeCanvas);
  fixture.detectChanges();
  return fixture;
}

const kindsOf = (fixture: { nativeElement: HTMLElement }) =>
  Array.from(fixture.nativeElement.querySelectorAll('[data-panel-kind]')).map((el) => el.getAttribute('data-panel-kind'));

describe('Home structural contract', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Panels load through dynamic imports; let them settle before the environment is torn down.
  afterEach(async () => {
    await settle(150);
  });

  describe('a fixture panel kind', () => {
    it('is rendered by Home once added, and restored from the persisted layout, with no Home branching', async () => {
      configure([FIXTURE_KIND]);
      expect(TestBed.inject(HomeLayoutService).appendInstance('fixture-kind')).toBe('fixture-kind');

      const first = render();
      await until(first, () => first.nativeElement.querySelector('[data-testid="fixture-panel"]') !== null);
      expect(kindsOf(first)).toContain('fixture-kind');
      expect(first.nativeElement.querySelector('[data-testid="fixture-panel"]')?.textContent).toContain('Fixture panel body');

      // A fresh injector (a "reload") restores it from storage alone.
      configure([FIXTURE_KIND]);
      const restored = render();
      await until(restored, () => restored.nativeElement.querySelector('[data-testid="fixture-panel"]') !== null);
      expect(kindsOf(restored)).toContain('fixture-kind');
      expect(restored.nativeElement.querySelector('[data-testid="fixture-panel"]')).not.toBeNull();
    });

    it('is not shipped in the default layout, since it declares no default placement', () => {
      configure([FIXTURE_KIND]);
      expect(TestBed.inject(HomeLayoutService).layout().instances.some((i) => i.kindId === 'fixture-kind')).toBe(false);
    });
  });

  describe('removed panel kinds and targets', () => {
    it('renders the remaining panels when a persisted kind is no longer registered, without a hole or error', async () => {
      configure([FIXTURE_KIND]);
      const layout = TestBed.inject(HomeLayoutService);
      expect(layout.appendInstance('fixture-kind')).not.toBeNull();
      await settle(); // persistence writes are deferred

      configure(); // the kind has been removed from the registry
      const warn = vi.spyOn(console, 'warn');
      const fixture = render();
      await settle();
      fixture.detectChanges();

      const kinds = kindsOf(fixture);
      expect(kinds).not.toContain('fixture-kind');
      expect(kinds).toContain('home-search');
      expect(kinds.length).toBeGreaterThan(1);
      expect(fixture.nativeElement.querySelector('[data-testid="home-empty"]')).toBeNull();
      // Every rendered cell holds a real panel: no empty shells for the dormant instance.
      for (const cell of Array.from(fixture.nativeElement.querySelectorAll('[data-panel-kind]')) as HTMLElement[]) {
        expect(cell.querySelector('app-panel-host')).not.toBeNull();
      }
      expect(warn).not.toHaveBeenCalled();
      // The dormant instance is kept (so it is not lost), just not drawn.
      expect(TestBed.inject(HomeLayoutService).data().instances.some((i) => i.kindId === 'fixture-kind')).toBe(true);
      warn.mockRestore();
    });

    it('renders a shortcut panel whose targets were removed as disabled chips, leaving the rest of Home intact', async () => {
      configure();
      const layout = TestBed.inject(HomeLayoutService);
      const id = layout.appendInstance('user-shortcuts', {
        kind: 'shortcut',
        title: 'Mine',
        targets: [
          { id: 't1', kind: 'tool', ref: 'tool-that-was-removed', label: '' },
          { id: 't2', kind: 'command', ref: 'command:that:was:removed', label: '' },
        ],
      });
      expect(id).not.toBeNull();
      await settle();

      const fixture = render();
      const panelOf = () => fixture.nativeElement.querySelector(`[data-panel-instance="${id}"]`) as HTMLElement;
      await until(fixture, () => panelOf().querySelector('button') !== null);
      const panel = panelOf();
      const chips = Array.from(panel.querySelectorAll('button')).filter((b) => b.textContent?.includes('Unavailable shortcut'));
      expect(chips).toHaveLength(2);
      expect(chips.every((b) => b.disabled)).toBe(true);
      expect(kindsOf(fixture)).toContain('home-search');
      expect(fixture.nativeElement.querySelector('[data-testid="home-empty"]')).toBeNull();
    });
  });

  describe('chart empty states', () => {
    it('shows an explanation, not a chart of zeros, when nothing has been recorded', () => {
      configure();
      const trend = TestBed.createComponent(ActivityTrendPanel);
      trend.detectChanges();
      const category = TestBed.createComponent(CategoryUsagePanel);
      category.detectChanges();

      expect(trend.nativeElement.textContent).toContain('No opens tracked yet');
      expect(trend.nativeElement.querySelector('app-bar-chart')).toBeNull();
      expect(trend.nativeElement.querySelector('canvas')).toBeNull();
      expect(category.nativeElement.textContent).toContain('No usage yet');
      expect(category.nativeElement.querySelector('app-ranked-bars-chart')).toBeNull();
      expect(category.nativeElement.querySelector('canvas')).toBeNull();
    });

    it('draws the charts only once real opens exist (so the empty check above is not vacuous)', () => {
      configure();
      TestBed.inject(UsageService).recordOpen(TOOL_DEFINITIONS[0].id);
      const trend = TestBed.createComponent(ActivityTrendPanel);
      trend.detectChanges();
      const category = TestBed.createComponent(CategoryUsagePanel);
      category.detectChanges();

      expect(trend.nativeElement.querySelector('app-bar-chart')).not.toBeNull();
      expect(category.nativeElement.querySelector('app-ranked-bars-chart')).not.toBeNull();
    });
  });

  describe('built-in panels read live stores', () => {
    it('Favorites follows FavoritesService: pinning shows the tool, unpinning omits the panel', () => {
      configure();
      const tool = TOOL_DEFINITIONS[0];
      const favorites = TestBed.inject(FavoritesService);
      const fixture = render();
      expect(kindsOf(fixture)).not.toContain('favorites');

      favorites.toggleTool(tool.id);
      fixture.detectChanges();
      expect(kindsOf(fixture)).toContain('favorites');

      favorites.toggleTool(tool.id);
      fixture.detectChanges();
      expect(kindsOf(fixture)).not.toContain('favorites');
    });

    it('Favorites lists the pinned tool from the store', async () => {
      configure();
      const tool = TOOL_DEFINITIONS[0];
      TestBed.inject(FavoritesService).toggleTool(tool.id);
      const fixture = render();
      const label = tool.shortTitle ?? tool.title;
      const panelOf = () => fixture.nativeElement.querySelector('[data-panel-kind="favorites"]') as HTMLElement | null;
      await until(fixture, () => panelOf()?.textContent?.includes(label) === true);
      expect(panelOf()?.textContent).toContain(label);
    });

    it('Recently Used follows UsageService as tools are opened', async () => {
      configure();
      const [a, b] = TOOL_DEFINITIONS;
      const usage = TestBed.inject(UsageService);
      const fixture = render();
      expect(kindsOf(fixture)).not.toContain('recent-tools');

      usage.recordOpen(a.id);
      fixture.detectChanges();
      const labelA = a.shortTitle ?? a.title;
      const labelB = b.shortTitle ?? b.title;
      const panelOf = () => fixture.nativeElement.querySelector('[data-panel-kind="recent-tools"]') as HTMLElement | null;
      await until(fixture, () => panelOf()?.textContent?.includes(labelA) === true);
      expect(panelOf()?.textContent).toContain(labelA);
      expect(panelOf()?.textContent).not.toContain(labelB);

      usage.recordOpen(b.id);
      await until(fixture, () => panelOf()?.textContent?.includes(labelB) === true);
      expect(panelOf()?.textContent).toContain(labelB);
    });
  });

  describe('shortcut panel confirmation boundary', () => {
    it('restoring a layout never runs the target; a click goes through the target command’s own execute (its confirmation path)', async () => {
      const action = vi.fn(); // the consequential work
      const gate = vi.fn(); // stands in for the target's confirmation step: it does NOT confirm by itself
      const command: PaletteCommand = { id: 'native:danger', kind: 'native', title: 'Dangerous action', execute: () => gate(action) };
      const providers: Provider[] = [{ provide: COMMAND_SOURCE, multi: true, useValue: { commands: () => [command] } }];

      configure([], providers);
      const id = TestBed.inject(HomeLayoutService).appendInstance('user-shortcuts', {
        kind: 'shortcut',
        title: '',
        targets: [{ id: 's1', kind: 'command', ref: 'native:danger', label: '' }],
      });
      await settle(); // persistence writes are deferred

      // Restore in a fresh injector, as after a reload.
      configure([], providers);
      const fixture = render();
      const panelOf = () => fixture.nativeElement.querySelector(`[data-panel-instance="${id}"]`) as HTMLElement;
      await until(fixture, () => panelOf().querySelector('button') !== null);
      expect(gate).not.toHaveBeenCalled();
      expect(action).not.toHaveBeenCalled();

      const chip = Array.from((fixture.nativeElement.querySelector(`[data-panel-instance="${id}"]`) as HTMLElement).querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Dangerous action'),
      ) as HTMLButtonElement;
      expect(chip.disabled).toBe(false);
      chip.click();
      await TestBed.inject(ApplicationRef).whenStable();

      // Exactly the command's own confirmation gate ran; the shortcut did not bypass it or run the action itself.
      expect(gate).toHaveBeenCalledTimes(1);
      expect(gate).toHaveBeenCalledWith(action);
      expect(action).not.toHaveBeenCalled();
    });
  });
});

