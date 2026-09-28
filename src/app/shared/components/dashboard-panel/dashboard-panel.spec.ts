import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DashboardPanel } from './dashboard-panel';

@Component({
  imports: [DashboardPanel],
  template: `
    <app-dashboard-panel title="Recent" [empty]="true">
      <span panelEmpty>Nothing yet</span>
    </app-dashboard-panel>
  `,
})
class EmptyStateHost {}

describe('DashboardPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders the title and item count', () => {
    const fixture = TestBed.createComponent(DashboardPanel);
    fixture.componentRef.setInput('title', 'Favorites');
    fixture.componentRef.setInput('itemCount', 5);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Favorites');
    expect(text).toContain('5');
  });

  it('shows a loading state and hides projected content', () => {
    const fixture = TestBed.createComponent(DashboardPanel);
    fixture.componentRef.setInput('title', 'Recent');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Loading');
  });

  it('shows projected empty-state content when empty', () => {
    const fixture = TestBed.createComponent(EmptyStateHost);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing yet');
  });

  it('emits viewAll when the View all button is clicked', () => {
    const fixture = TestBed.createComponent(DashboardPanel);
    fixture.componentRef.setInput('title', 'Favorites');
    fixture.componentRef.setInput('viewAllLabel', 'View all');
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.viewAll.subscribe(() => (emitted = true));

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button).toBeTruthy();
    button.click();

    expect(emitted).toBe(true);
  });

  it('does not render a View all button when no label is provided', () => {
    const fixture = TestBed.createComponent(DashboardPanel);
    fixture.componentRef.setInput('title', 'Favorites');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
