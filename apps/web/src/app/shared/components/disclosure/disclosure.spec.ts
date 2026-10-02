import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Disclosure } from './disclosure';

@Component({
  imports: [Disclosure],
  template: `<app-disclosure label="More" summary="details" [badge]="badge"><p id="body">hidden body</p></app-disclosure>`,
})
class Host {
  badge: number | undefined = undefined;
}

describe('Disclosure', () => {
  function setup(badge?: number) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.badge = badge;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button') as HTMLButtonElement;
    return { fixture, el, button };
  }

  it('starts collapsed with the content absent and a summary visible', () => {
    const { el, button } = setup();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#body')).toBeNull();
    expect(button.textContent).toContain('details');
  });

  it('expands on click, wiring aria-controls to the panel and hiding the summary', () => {
    const { fixture, el, button } = setup();
    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = el.querySelector(`#${button.getAttribute('aria-controls')}`);
    expect(panel?.textContent).toContain('hidden body');
    expect(button.textContent).not.toContain('details');
  });

  it('shows the badge even while collapsed and hides zero', () => {
    expect(setup(3).el.querySelector('[data-testid="disclosure-badge"]')?.textContent).toContain('3');
    expect(setup(0).el.querySelector('[data-testid="disclosure-badge"]')).toBeNull();
  });
});
