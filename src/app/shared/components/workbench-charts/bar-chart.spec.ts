import { TestBed } from '@angular/core/testing';
import { BarChart } from './bar-chart';

// Canvas 2D context is stubbed globally in src/testing/fast-check.setup.ts.
describe('BarChart', () => {
  function create(bars: { label: string; value: number | null; detail: string }[], summary = 'Total: 5') {
    const fixture = TestBed.createComponent(BarChart);
    fixture.componentRef.setInput('bars', bars);
    fixture.componentRef.setInput('label', 'Opens per day');
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
    return fixture;
  }

  const bars = [
    { label: 'Mon', value: 5, detail: 'Mon 1 Jan: 5 opens' },
    { label: 'Tue', value: null, detail: 'Tue 2 Jan: not tracked' },
  ];

  it('shows every label and value as visible text, with a dash for untracked days', () => {
    const text = create(bars).nativeElement.textContent as string;
    expect(text).toContain('Mon');
    expect(text).toContain('5');
    expect(text).toContain('Tue');
    expect(text).toContain('–');
  });

  it('gives each bar a tab stop and an accessible name', () => {
    const cells = create(bars).nativeElement.querySelectorAll('li') as NodeListOf<HTMLElement>;
    expect(cells).toHaveLength(2);
    expect(cells[0].tabIndex).toBe(0);
    expect(cells[0].getAttribute('aria-label')).toBe('Mon 1 Jan: 5 opens');
    expect(cells[1].getAttribute('aria-label')).toBe('Tue 2 Jan: not tracked');
  });

  it('shows the summary by default, and a bar detail on focus, restoring on blur', () => {
    const fixture = create(bars);
    const root = fixture.nativeElement as HTMLElement;
    const cell = root.querySelectorAll('li')[1] as HTMLElement;
    const detail = () => root.querySelector('p')!.textContent!.trim();

    expect(detail()).toBe('Total: 5');
    cell.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(detail()).toBe('Tue 2 Jan: not tracked');
    cell.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(detail()).toBe('Total: 5');
  });

  it('shows a bar detail on hover as well as focus', () => {
    const fixture = create(bars);
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelectorAll('li')[0] as HTMLElement).dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(root.querySelector('p')!.textContent!.trim()).toBe('Mon 1 Jan: 5 opens');
  });
});
