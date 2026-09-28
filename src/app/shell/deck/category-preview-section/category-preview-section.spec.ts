import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CategoryPreviewSection } from './category-preview-section';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { routes } from '../../../core/routing/app.routes';

describe('CategoryPreviewSection', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('renders one card per category, each bounded to a handful of representative tools', () => {
    const fixture = TestBed.createComponent(CategoryPreviewSection);
    fixture.detectChanges();

    const panels = fixture.nativeElement.querySelectorAll('app-dashboard-panel');
    expect(panels.length).toBe(8);

    const securityPanel = Array.from(panels).find((p) => (p as HTMLElement).textContent?.includes('Security')) as HTMLElement;
    const toolLinks = securityPanel.querySelectorAll('ul a');
    expect(toolLinks.length).toBeLessThanOrEqual(6);
    expect(toolLinks.length).toBeGreaterThan(0);
  });

  it('sorts a favorited tool to the front of its category preview', () => {
    TestBed.inject(FavoritesService).toggleTool('jwt');

    const fixture = TestBed.createComponent(CategoryPreviewSection);
    fixture.detectChanges();

    const panels: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('app-dashboard-panel'));
    const securityPanel = panels.find((p) => p.textContent?.includes('Security'))!;
    const firstTool = securityPanel.querySelector('ul a');

    expect(firstTool?.textContent).toContain('JWT');
  });

  it('navigates to Browse Tools filtered to the category on "View all"', () => {
    const fixture = TestBed.createComponent(CategoryPreviewSection);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const panels: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('app-dashboard-panel'));
    const securityPanel = panels.find((p) => p.textContent?.includes('Security'))!;
    const viewAllButton = Array.from(securityPanel.querySelectorAll('button')).find((b) => b.textContent?.includes('View all')) as HTMLButtonElement;
    viewAllButton.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/tools'], { queryParams: { category: 'security' } });
  });
});
