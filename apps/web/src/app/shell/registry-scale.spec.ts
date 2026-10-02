import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../core/routing/app.routes';
import { CATEGORY_METADATA, TOOL_CATEGORIES, ToolCategory } from "@dude/shared-types/shared/models/tool-category.model";
import {
  provideSyntheticToolRegistry,
  SYNTHETIC_KNOWN_TITLES,
  SyntheticStubComponent,
  syntheticToolDefinitions,
} from '../../testing/synthetic-tool-registry';
import { BrowseTools } from './browse-tools/browse-tools';
import { Sidebar, SIDEBAR_CATEGORY_LIMIT } from './sidebar/sidebar';
import { CategoryPreviewSection } from './deck/category-preview-section/category-preview-section';
import { CategoryStrip } from './deck/category-strip/category-strip';
import { Deck } from './deck/deck';

/** Phase 30L.6/30L.7: the shell must not assume today's tool count is a ceiling. */
const PREVIEW_LIMIT = 6;

function expectedCounts(size: number): Record<ToolCategory, number> {
  const counts = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c, 0])) as Record<ToolCategory, number>;
  for (const tool of syntheticToolDefinitions(size)) counts[tool.category]++;
  return counts;
}

function configure(size: number): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'tools/:id', component: SyntheticStubComponent }, { path: 'tools', component: BrowseTools }, ...routes]),
      ...provideSyntheticToolRegistry(size),
    ],
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/tools');
});
afterEach(async () => {
  // Lazy panels resolve through dynamic imports; let them settle before teardown.
  await new Promise((resolve) => setTimeout(resolve, 150));
});

describe.each([500, 1000])('registry scale: %i synthetic tools', (size) => {
  describe('Browse Tools', () => {
    function mount() {
      configure(size);
      const t0 = performance.now();
      const fixture = TestBed.createComponent(BrowseTools);
      fixture.detectChanges();
      const renderMs = performance.now() - t0;
      const c = fixture.componentInstance as unknown as {
        sorted: () => readonly { id: string; title: string; category: ToolCategory }[];
        counts: () => { all: number; byCategory: Record<ToolCategory, number> };
        query: { set(v: string): void };
        categoryFacet: { set(v: ToolCategory | 'all'): void };
        sortMode: { set(v: string): void };
      };
      return { fixture, c, renderMs };
    }

    it('exposes the full registry, renders within budget, and reports the time', () => {
      const { fixture, c, renderMs } = mount();
      expect(c.sorted().length).toBe(size);
      expect(c.counts().all).toBe(size);
      expect(fixture.nativeElement.querySelector('app-data-table')).not.toBeNull();
      console.log(`[scale] Browse Tools initial render @${size}: ${renderMs.toFixed(0)}ms`);
      expect(renderMs).toBeLessThan(3000);
    });

    it('search narrows to a known synthetic tool', () => {
      const { fixture, c } = mount();
      c.query.set(SYNTHETIC_KNOWN_TITLES[0]);
      fixture.detectChanges();
      const titles = c.sorted().map((t) => t.title);
      expect(titles).toContain(SYNTHETIC_KNOWN_TITLES[0]);
      expect(titles.length).toBeLessThan(5);
    });

    it('category filter narrows correctly and category counts match', () => {
      const { fixture, c } = mount();
      const expected = expectedCounts(size);
      expect(c.counts().byCategory).toEqual(expected);
      for (const category of TOOL_CATEGORIES) {
        c.categoryFacet.set(category);
        expect(c.sorted().length).toBe(expected[category]);
        expect(c.sorted().every((t) => t.category === category)).toBe(true);
      }
      fixture.detectChanges();
    }, 20000);

    it('sort is deterministic across renders', () => {
      const order = (mode: string) => {
        const { fixture, c } = mount();
        c.sortMode.set(mode);
        fixture.detectChanges();
        return c.sorted().map((t) => t.id);
      };
      for (const mode of ['recommended', 'alpha', 'category']) expect(order(mode)).toEqual(order(mode));
    });
  });

  describe('Sidebar', () => {
    function mount() {
      configure(size);
      const fixture = TestBed.createComponent(Sidebar);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }
    const toolLinks = (el: HTMLElement) => el.querySelectorAll('a[href^="/tools/synthetic-tool-"]');
    const expand = (el: HTMLElement, label: string) =>
      Array.from(el.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === `Expand ${label}`)!.click();

    it('has exactly one row per category and no tool links while collapsed', () => {
      const { el } = mount();
      expect(el.querySelectorAll('a[href^="/tools?category="]').length).toBe(TOOL_CATEGORIES.length);
      expect(toolLinks(el).length).toBe(0);
    });

    it('shows real per-category counts', () => {
      const { el } = mount();
      const expected = expectedCounts(size);
      for (const category of TOOL_CATEGORIES) {
        const row = el.querySelector(`a[href="/tools?category=${category}"]`)!;
        expect(row.textContent).toContain(String(expected[category]));
      }
    });

    it('an expanded category renders at most the cap plus an "All N" link', () => {
      const { fixture, el } = mount();
      const expected = expectedCounts(size);
      expand(el, CATEGORY_METADATA.data.label);
      fixture.detectChanges();
      expect(toolLinks(el).length).toBe(SIDEBAR_CATEGORY_LIMIT);
      const text = `All ${expected.data} ${CATEGORY_METADATA.data.label} tools`;
      expect(Array.from(el.querySelectorAll('a')).some((a) => a.textContent?.includes(text))).toBe(true);
    });

    it('keeps the active tool visible beyond the cap (cap + 1 links)', async () => {
      const { fixture, el } = mount();
      const active = syntheticToolDefinitions(size).filter((t) => t.category === 'data')[SIDEBAR_CATEGORY_LIMIT + 5];
      await TestBed.inject(Router).navigateByUrl(active.route);
      fixture.detectChanges();
      expect(toolLinks(el).length).toBe(SIDEBAR_CATEGORY_LIMIT + 1);
      expect(el.querySelector(`a[href="${active.route}"]`)).not.toBeNull();
    });
  });

  describe('Home building blocks', () => {
    it('category previews and strip stay bounded', () => {
      configure(size);
      const preview = TestBed.createComponent(CategoryPreviewSection);
      preview.detectChanges();
      const links = (preview.nativeElement as HTMLElement).querySelectorAll('a[href^="/tools/synthetic-tool-"], button');
      expect(links.length).toBeGreaterThan(0);
      expect(links.length).toBeLessThanOrEqual((PREVIEW_LIMIT + 1) * TOOL_CATEGORIES.length);

      const strip = TestBed.createComponent(CategoryStrip);
      strip.detectChanges();
      expect(strip.nativeElement.querySelectorAll('a[href^="/tools/"]').length).toBe(0);
      expect(strip.nativeElement.querySelectorAll('a').length).toBeLessThanOrEqual(TOOL_CATEGORIES.length + 1);
    });
  });
});

describe('Home is independent of registry size', () => {
  async function toolAnchors(size: number): Promise<number> {
    configure(size);
    const fixture = TestBed.createComponent(Deck);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    const anchors = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).filter((a) => /^\/tools\/[^?]/.test(a.getAttribute('href') ?? ''));
    fixture.destroy();
    return anchors.length;
  }

  it('renders the same, small number of tool links at 500 and 1000 tools', async () => {
    const at500 = await toolAnchors(500);
    const at1000 = await toolAnchors(1000);
    console.log(`[scale] Home tool-route anchors: 500 -> ${at500}, 1000 -> ${at1000}`);
    expect(at500).toBeLessThanOrEqual(60);
    expect(at1000).toBe(at500);
  });
});
