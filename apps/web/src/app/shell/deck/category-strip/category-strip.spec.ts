import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryStrip } from './category-strip';
import { routes } from '../../../core/routing/app.routes';

describe('CategoryStrip', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('renders one chip per category with a live registry-derived count', () => {
    const fixture = TestBed.createComponent(CategoryStrip);
    fixture.detectChanges();

    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('a'));
    expect(links.length).toBe(8);
    expect(fixture.nativeElement.textContent).toContain('Data');
    expect(fixture.nativeElement.textContent).toContain('Security');
  });

  it('links each chip into Browse Tools filtered to that category', () => {
    const fixture = TestBed.createComponent(CategoryStrip);
    fixture.detectChanges();

    const link = Array.from(fixture.nativeElement.querySelectorAll('a')).find((a) =>
      (a as HTMLAnchorElement).textContent?.includes('Security'),
    ) as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/tools?category=security');
  });
});
