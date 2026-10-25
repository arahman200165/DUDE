import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HubStepUpService } from '../hub/hub-step-up.service';
import { HubWebFeedback } from './hub-web-feedback';
import { HubWebOverlay } from './hub-web-overlay';

function render() {
  TestBed.configureTestingModule({ providers: [{ provide: HubWebFeedback, useValue: new HubWebFeedback() }] });
  const fixture = TestBed.createComponent(HubWebOverlay);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const password = () => root.querySelector('[data-testid="step-up-password"]') as HTMLInputElement | null;
  const type = (value: string) => { const input = password()!; input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const submit = () => (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  return { fixture, root, password, type, submit, stepUp: TestBed.inject(HubStepUpService) };
}

describe('HubWebOverlay', () => {
  it('shows no step-up prompt until one is asked for', () => {
    expect(render().password()).toBeNull();
  });

  it('renders a pending step-up request and answers it with the typed password', async () => {
    const { fixture, password, type, submit, stepUp } = render();
    const answer = stepUp.ask();
    fixture.detectChanges();
    expect(password()).not.toBeNull();
    type('owner-password');
    submit();
    await expect(answer).resolves.toBe('owner-password');
    fixture.detectChanges();
    expect(password()).toBeNull();
  });

  it('cancelling resolves the request with null', async () => {
    const { fixture, root, stepUp } = render();
    const answer = stepUp.ask();
    fixture.detectChanges();
    (root.querySelector('[data-testid="step-up-cancel"]') as HTMLButtonElement).click();
    await expect(answer).resolves.toBeNull();
  });

  it('a re-ask after a refused password is a fresh prompt with the reason and an empty field', async () => {
    const { fixture, root, password, type, submit, stepUp } = render();
    const first = stepUp.ask();
    fixture.detectChanges();
    type('wrong');
    submit();
    await first;
    void stepUp.ask('The password is incorrect.');
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="step-up-error"]')?.textContent).toContain('The password is incorrect.');
    expect(password()!.value).toBe('');
  });
});
