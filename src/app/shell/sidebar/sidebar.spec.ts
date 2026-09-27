import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sidebar } from './sidebar';
import { routes } from '../../core/routing/app.routes';

describe('Sidebar', () => {
  beforeEach(() => {
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
});
