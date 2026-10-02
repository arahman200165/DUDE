import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';
import { UsageService } from '../../../core/usage/usage.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { InsightsSection } from './insights-section';

// Canvas 2D context is stubbed globally in apps/web/src/testing/fast-check.setup.ts.
describe('InsightsSection', () => {
  const toolA = TOOL_DEFINITIONS[0];
  const toolB = TOOL_DEFINITIONS[1];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(compact = false) {
    const fixture = TestBed.createComponent(InsightsSection);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';

  it('shows honest empty states for every panel when nothing has been recorded', () => {
    const content = text(render());

    expect(content).toContain('No opens tracked yet');
    expect(content).toContain('No usage yet');
    expect(content).toContain('No tools used yet');
    expect(content).toContain('No recent activity yet');
  });

  it('labels the first tracked period as partial and totals the same days the chart shows', () => {
    const usage = TestBed.inject(UsageService);
    usage.recordOpen(toolA.id);
    usage.recordOpen(toolA.id);
    usage.recordOpen(toolB.id);

    const fixture = render();
    const content = text(fixture);

    expect(content).toContain('3 opens · partial period, tracked since');
    const opensTile = fixture.nativeElement.querySelector('[data-tile="opens"]') as HTMLElement;
    expect(opensTile.textContent).toContain('3');
    expect(opensTile.textContent).toContain('partial period');
    const uniqueTile = fixture.nativeElement.querySelector('[data-tile="unique"]') as HTMLElement;
    expect(uniqueTile.textContent).toContain('2');
  });

  it('renders seven focusable day cells with visible text, untracked days shown as a dash', () => {
    TestBed.inject(UsageService).recordOpen(toolA.id);

    const cells = render().nativeElement.querySelectorAll('app-bar-chart li') as NodeListOf<HTMLElement>;

    expect(cells).toHaveLength(7);
    expect(Array.from(cells).every((c) => c.tabIndex === 0)).toBe(true);
    expect(cells[0].textContent).toContain('–');
    expect(cells[6].getAttribute('aria-label')).toContain('(today): 1 open');
  });

  it('labels Top Tools counts and the category chart as lifetime, and ranks by lifetime uses', () => {
    const usage = TestBed.inject(UsageService);
    usage.recordOpen(toolB.id);
    usage.recordOpen(toolA.id);
    usage.recordOpen(toolA.id);

    const fixture = render();
    const content = text(fixture);

    expect(content).toContain('Uses are lifetime counts');
    expect(content).toContain('Lifetime opens by category');
    // rows[0] is the header row; rows[1] is the top-ranked tool (2 lifetime uses beats 1).
    const rows = fixture.nativeElement.querySelectorAll('app-top-tools-table [role="row"]') as NodeListOf<HTMLElement>;
    expect(rows[1].textContent).toContain(toolA.title);
    expect(rows[2].textContent).toContain(toolB.title);
  });

  it('switches the category chart to the 7-day view, keeping the partial label', () => {
    TestBed.inject(UsageService).recordOpen(toolA.id);
    const fixture = render();

    const sevenDay = Array.from(fixture.nativeElement.querySelectorAll('app-category-usage-panel button')).find((b) =>
      (b as HTMLElement).textContent?.includes('7 days'),
    ) as HTMLButtonElement;
    sevenDay.click();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Opens by category, last 7 days (partial period)');
    expect(sevenDay.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles a favorite inline from the Top Tools table', () => {
    TestBed.inject(UsageService).recordOpen(toolA.id);
    const favorites = TestBed.inject(FavoritesService);
    const fixture = render();

    const star = fixture.nativeElement.querySelector(`button[aria-label="Favorite ${toolA.title}"]`) as HTMLButtonElement;
    star.click();
    fixture.detectChanges();

    expect(favorites.isToolPinned(toolA.id)).toBe(true);
    expect(fixture.nativeElement.querySelector(`button[aria-label="Unfavorite ${toolA.title}"]`)).not.toBeNull();
  });

  it('never presents an open workspace tab as recent activity', () => {
    TestBed.inject(WorkspaceLayoutService).openTool(toolA.id);

    const content = text(render());

    expect(content).toContain('No recent activity yet');
  });

  it('shows real tool opens in Recent Activity, bounded by the compact limit', () => {
    const usage = TestBed.inject(UsageService);
    for (const tool of TOOL_DEFINITIONS.slice(0, 9)) usage.recordOpen(tool.id);

    const fixture = render(true);
    const rows = fixture.nativeElement.querySelectorAll('app-recent-activity-table [role="row"]');

    // 1 header row + 5 data rows.
    expect(rows).toHaveLength(6);
  });
});
