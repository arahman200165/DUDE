import { ApplicationRef } from '@angular/core';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Sidebar, SIDEBAR_CATEGORY_LIMIT } from './sidebar';
import { routes } from '../../core/routing/app.routes';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { TOOL_DEFINITIONS } from '../../core/registry/tool-definitions';
import { FavoritesService } from '../../core/favorites/favorites.service';
import { ToolLauncherService } from '../../core/registry/tool-launcher.service';

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
  });

  it('pins a Settings link to the footer and no longer offers a clear-all-data button', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const settingsLink = Array.from(element.querySelectorAll('a')).find((link) => link.textContent?.trim() === 'Settings');
    expect(settingsLink?.getAttribute('href')).toBe('/settings');
    expect(settingsLink?.closest('div.border-t')).not.toBeNull();
    expect(element.textContent).not.toContain('Clear all DUDE data');
  });

  it('lists the shell destinations but no Settings tool entry among the categories', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual(expect.arrayContaining(['/smart-paste', '/workspace', '/history', '/pipelines', '/quick-run', '/projects', '/settings']));
    expect(hrefs).not.toContain('/tools/settings');
  });

  it('collapses every category by default -- no hundreds of individual tool links (30B.1 exit criterion)', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    // One link per category (into Browse Tools) plus a "Browse all" link -- never a per-tool link.
    const toolRouteLinks = Array.from(element.querySelectorAll('a[href^="/tools/"]'));
    expect(toolRouteLinks.length).toBe(0);

    const categoryLinks = Array.from(element.querySelectorAll('a[href^="/tools?"]'));
    expect(categoryLinks.length).toBe(TOOL_CATEGORIES.length);
  });

  it('a category row links into Browse Tools filtered by that category, and the caret expands it inline', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const securityLink = Array.from(element.querySelectorAll('a')).find((link) => link.getAttribute('href')?.startsWith('/tools?category=security'));
    expect(securityLink).toBeTruthy();

    const caret = Array.from(element.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Expand Security')!;
    expect(caret).toBeTruthy();
    expect(element.querySelectorAll('a[href^="/tools/"]').length).toBe(0);

    caret.click();
    fixture.detectChanges();

    expect(element.querySelectorAll('a[href^="/tools/"]').length).toBeGreaterThan(0);
    expect(caret.getAttribute('aria-label')).toBe('Collapse Security');
  });

  it('auto-expands and highlights the active tool\'s category on direct navigation, even though it starts collapsed', async () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const tool = TOOL_DEFINITIONS.find((definition) => definition.category === 'security')!;
    await router.navigateByUrl(tool.route);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    // The category was collapsed by default (no per-tool link in the DOM at all) -- landing
    // directly on a tool inside it must auto-expand the category so the active link is reachable.
    expect(element.querySelector(`a[href="${tool.route}"]`)).toBeTruthy();
    const caret = Array.from(element.querySelectorAll('button')).find((button) => button.getAttribute('aria-label')?.endsWith('Security'))!;
    expect(caret.getAttribute('aria-label')).toBe('Collapse Security');
  });

  it('shows registry-derived category counts and a total "Browse all" count', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const sidebar = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;

    const counts = sidebar['counts']();
    expect(element.textContent).toContain(String(counts.all));
    for (const category of TOOL_CATEGORIES) {
      expect(counts.byCategory[category]).toBeGreaterThanOrEqual(0);
    }
  });

  it('hides the Favorites and Recents sections entirely when empty', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('Favorites');
    expect(element.textContent).not.toContain('Recents');
  });

  it('shows a pinned favorite in the compact Favorites section and opens it through ToolLauncherService', () => {
    const fixture = TestBed.createComponent(Sidebar);
    const favorites = TestBed.inject(FavoritesService);
    const launcher = TestBed.inject(ToolLauncherService);
    const openSpy = vi.spyOn(launcher, 'open').mockImplementation(() => {});

    const tool = TOOL_DEFINITIONS[0];
    favorites.toggleTool(tool.id);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Favorites');
    const favoriteButton = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes(tool.shortTitle ?? tool.title));
    expect(favoriteButton).toBeTruthy();

    favoriteButton!.click();
    expect(openSpy).toHaveBeenCalledWith(tool);
  });
});

describe('Sidebar category expand persistence (Phase 30I.3)', () => {
  const KEY = 'dude:v1:__sidebar__:openCategories';
  const stable = () => TestBed.inject(ApplicationRef).whenStable();

  function mount() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const caret = (el: HTMLElement, verb: 'Expand' | 'Collapse') =>
    Array.from(el.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === `${verb} Security`);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps an expanded category open in the next session, and a collapse is remembered too', async () => {
    let { fixture, el } = mount();
    caret(el, 'Expand')!.click();
    fixture.detectChanges();
    await stable();
    expect(localStorage.getItem(KEY)).toBe('["security"]');

    ({ fixture, el } = mount());
    expect(caret(el, 'Collapse')).toBeTruthy();

    caret(el, 'Collapse')!.click();
    fixture.detectChanges();
    await stable();
    ({ el } = mount());
    expect(caret(el, 'Expand')).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe('[]');
  });

  it('ignores unknown or malformed stored values instead of breaking the sidebar', () => {
    localStorage.setItem(KEY, '["security","not-a-category",5]');
    const { el } = mount();
    expect(caret(el, 'Collapse')).toBeTruthy();

    localStorage.setItem(KEY, '"garbage"');
    expect(() => mount()).not.toThrow();
  });

  it('is removed by Clear all local data', async () => {
    const { fixture, el } = mount();
    caret(el, 'Expand')!.click();
    fixture.detectChanges();
    await stable();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    TestBed.inject(PersistenceService).clearAll();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('Sidebar expanded-category cap', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('caps an expanded category and links to the rest in Browse Tools', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const total = TOOL_DEFINITIONS.filter((tool) => tool.category === 'developer').length;
    expect(total).toBeGreaterThan(SIDEBAR_CATEGORY_LIMIT);

    Array.from(element.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Expand Developer')!.click();
    fixture.detectChanges();

    expect(element.querySelectorAll('a[href^="/tools/"]').length).toBe(SIDEBAR_CATEGORY_LIMIT);
    const more = Array.from(element.querySelectorAll('a')).find((a) => a.textContent?.includes(`All ${total} Developer tools`));
    expect(more?.getAttribute('href')).toBe('/tools?category=developer');
  });

  it('keeps the active tool visible even when it sits beyond the cap', async () => {
    const beyond = TOOL_DEFINITIONS.filter((tool) => tool.category === 'developer')[SIDEBAR_CATEGORY_LIMIT + 3];
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl(beyond.route);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('a[href^="/tools/"]').length).toBe(SIDEBAR_CATEGORY_LIMIT + 1);
    expect(element.querySelector(`a[href="${beyond.route}"]`)).not.toBeNull();
  });
});
