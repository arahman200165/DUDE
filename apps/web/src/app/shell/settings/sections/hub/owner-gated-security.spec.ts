import { TestBed } from '@angular/core/testing';
import { buttonWithText, configureHubTest, createTestPort, settle, typeInto } from './testing/hub-test-port';
import { OwnerGatedSecuritySettings } from './owner-gated-security';

const PASSWORD = 'correct horse battery';

describe('OwnerGatedSecuritySettings (desktop)', () => {
  async function mount() {
    const test = createTestPort();
    configureHubTest(test.port);
    const fixture = TestBed.createComponent(OwnerGatedSecuritySettings);
    fixture.detectChanges();
    await settle(fixture);
    return { ...test, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows only the gate (and loads nothing) until the owner signs in', async () => {
    const { el, port } = await mount();
    expect(el.querySelector('[data-testid="owner-gate"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="sessions"]')).toBeNull();
    expect(port.listSessions).not.toHaveBeenCalled();
  });

  it('shows the section after sign-in and returns to the gate when the owner signs out from it', async () => {
    const { fixture, el, port } = await mount();
    typeInto(el.querySelector('#owner-gate-password') as HTMLInputElement, PASSWORD);
    await settle(fixture);
    buttonWithText(el, 'Sign in').click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="sessions"]')).not.toBeNull();
    expect(port.listSessions).toHaveBeenCalled();

    // The Security section's own "Sign out" of the current session.
    (el.querySelector('[data-testid="session-row"] button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(port.ownerSignOut).toHaveBeenCalled();
    expect(el.querySelector('[data-testid="owner-gate"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="sessions"]')).toBeNull();
  });
});
