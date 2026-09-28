import { TestBed } from '@angular/core/testing';
import { HomeActivityPanel } from './home-activity-panel';
import { UsageService } from '../../../core/usage/usage.service';

// Canvas 2D context is stubbed globally in src/testing/fast-check.setup.ts.
describe('HomeActivityPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the empty state when there is no recorded activity', () => {
    const fixture = TestBed.createComponent(HomeActivityPanel);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No activity yet');
  });

  it('renders the trend/most-used sections once a tool has been opened', () => {
    TestBed.inject(UsageService).recordOpen('base64');

    const fixture = TestBed.createComponent(HomeActivityPanel);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('No activity yet');
    expect(fixture.nativeElement.textContent).toContain('Opens, last 7 days');
    expect(fixture.nativeElement.textContent).toContain('Most-used tools');
  });
});
