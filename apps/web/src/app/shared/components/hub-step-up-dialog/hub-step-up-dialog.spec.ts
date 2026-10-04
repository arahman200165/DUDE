import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HubStepUpDialog } from './hub-step-up-dialog';

function render(message: string | null = null) {
  const fixture = TestBed.createComponent(HubStepUpDialog);
  fixture.componentRef.setInput('message', message);
  const submitted: string[] = [];
  let cancelled = 0;
  fixture.componentInstance.submitted.subscribe((p) => submitted.push(p));
  fixture.componentInstance.cancelled.subscribe(() => cancelled++);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector('[data-testid="step-up-password"]') as HTMLInputElement;
  const type = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const submitForm = () => (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  return { fixture, root, input, type, submitForm, submitted, cancelledCount: () => cancelled };
}

describe('HubStepUpDialog', () => {
  it('is a password prompt for the current password', () => {
    const { root, input } = render();
    expect(root.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    expect(root.querySelector('[data-testid="step-up-error"]')).toBeNull();
  });

  it('shows the message as an error', () => {
    const { root } = render('Wrong password.');
    expect(root.querySelector('[data-testid="step-up-error"]')?.textContent).toContain('Wrong password.');
  });

  it('submits the typed password with Confirm and with Enter (form submit), never an empty one', () => {
    const { root, type, submitForm, submitted } = render();
    const confirm = root.querySelector('[data-testid="step-up-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    submitForm();
    expect(submitted).toEqual([]);
    type('hunter2');
    expect(confirm.disabled).toBe(false);
    confirm.click();
    submitForm();
    expect(submitted).toEqual(['hunter2', 'hunter2']);
  });

  it('cancels with the Cancel button and with Escape', () => {
    const { root, cancelledCount } = render();
    (root.querySelector('[data-testid="step-up-cancel"]') as HTMLButtonElement).click();
    (root.querySelector('form') as HTMLFormElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelledCount()).toBe(2);
  });
});
