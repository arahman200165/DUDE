import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InsightsPage } from './insights-page';

// Canvas 2D context is stubbed globally in src/testing/fast-check.setup.ts.
describe('InsightsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders the full insights layout with a local-only privacy statement', () => {
    const fixture = TestBed.createComponent(InsightsPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Insights');
    expect(el.textContent).toContain('nothing is sent anywhere');
    expect(el.querySelector('app-insights-summary')).not.toBeNull();
    expect(el.querySelector('app-top-tools-table')).not.toBeNull();
    expect(el.querySelector('app-recent-activity-table')).not.toBeNull();
  });
});
