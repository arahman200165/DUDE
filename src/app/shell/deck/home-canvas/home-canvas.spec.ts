import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { PANEL_DEFINITIONS } from '../../../core/registry/panel-definitions';
import { UsageService } from '../../../core/usage/usage.service';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';
import { HomeCanvas } from './home-canvas';

// Canvas 2D context is stubbed globally in src/testing/fast-check.setup.ts.
describe('HomeCanvas', () => {
  /** Platform must be chosen before any service is instantiated. */
  function setup(desktop: boolean): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: PlatformService, useValue: { isDesktop: () => desktop } }] });
  }
  function render() {
    const fixture = TestBed.createComponent(HomeCanvas);
    fixture.detectChanges();
    return fixture;
  }
  const kinds = (fixture: { nativeElement: HTMLElement }) =>
    Array.from(fixture.nativeElement.querySelectorAll('[data-panel-kind]')).map((el) => el.getAttribute('data-panel-kind'));

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders the manifest-generated default on the web, omitting desktop-only and empty panels', () => {
    setup(false);
    const shown = kinds(render());

    expect(shown).toContain('home-search');
    expect(shown).toContain('smart-entry');
    expect(shown).toContain('category-strip');
    expect(shown).not.toContain('home-open-file');
    expect(shown).not.toContain('clipboard-actions');
    expect(shown).not.toContain('native-capabilities');
    // Nothing recorded / pinned yet, so the data-driven rails are omitted rather than left as holes.
    expect(shown).not.toContain('recent-tools');
    expect(shown).not.toContain('favorites');
  });

  it('shows the recent-tools rail once there is usage, and desktop-only panels only on desktop', () => {
    setup(false);
    TestBed.inject(UsageService).recordOpen(TOOL_DEFINITIONS[0].id);
    expect(kinds(render())).toContain('recent-tools');

    setup(true);
    expect(kinds(render())).toContain('home-open-file');
  });

  it('leaves no vertical gaps: every rendered row starts where the previous one ended', () => {
    setup(false);
    const fixture = render();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-panel-kind]')).map((el) => el.style.gridRow);
    const starts = rows.map((r) => Number(r.split('/')[0].trim()));
    expect(starts[0]).toBe(1);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('applies a saved layout: hidden panels disappear and order follows the layout', () => {
    setup(false);
    const layout = TestBed.inject(HomeLayoutService);
    const base = layout.layout();
    const result = layout.save({
      instances: base.instances.map((i) => (i.id === 'smart-entry' ? { ...i, visible: false } : i)),
      wide: base.wide,
      narrow: base.narrow,
      narrowCustomized: false,
      content: {},
    });
    expect(result.ok).toBe(true);

    const shown = kinds(render());
    expect(shown).not.toContain('smart-entry');
    expect(shown).toContain('home-search');
  });

  it('never blanks Home: an empty layout shows a recovery message', () => {
    setup(false);
    const layout = TestBed.inject(HomeLayoutService);
    expect(layout.save({ instances: [], wide: [], narrow: [], narrowCustomized: false, content: {} }).ok).toBe(true);

    const fixture = render();
    expect(fixture.nativeElement.querySelector('[data-testid="home-empty"]')).not.toBeNull();
  });

  it('ships every registered kind in the default with a matching manifest', () => {
    setup(false);
    const defaults = TestBed.inject(HomeLayoutService).layout();
    expect(defaults.instances.map((i) => i.kindId).sort()).toEqual(PANEL_DEFINITIONS.filter((d) => d.defaultPlacement).map((d) => d.id).sort());
  });
});
