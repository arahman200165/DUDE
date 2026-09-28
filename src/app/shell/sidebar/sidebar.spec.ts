import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sidebar } from './sidebar';
import { routes } from '../../core/routing/app.routes';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';

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

  it('a category row links into Browse Tools filtered by that category', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const securityLink = Array.from(element.querySelectorAll('a')).find((link) => link.getAttribute('href')?.startsWith('/tools?category=security'));
    expect(securityLink).toBeTruthy();
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
});
