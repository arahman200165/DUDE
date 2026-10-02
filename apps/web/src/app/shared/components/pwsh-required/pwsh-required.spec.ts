import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from '../../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge } from '../../../core/platform/testing/recording-fs-bridge';
import type { PwshStatus } from "@dude/contracts/system/system-types";
import { PwshRequired } from './pwsh-required';

@Component({
  imports: [PwshRequired],
  template: `<app-pwsh-required feature="Script runner"><p id="content">Ready</p></app-pwsh-required>`,
})
class Host {}

async function render(pwshStatus: (refresh?: boolean) => Promise<PwshStatus>) {
  installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, pwshStatus } }));
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PwshRequired', () => {
  afterEach(() => removeBridge());

  it('projects its content when PowerShell 7 is available', async () => {
    const { el } = await render(async () => ({ available: true, version: '7.4.1' }));
    expect(el.querySelector('#content')).not.toBeNull();
    expect(el.textContent).not.toContain('required');
  });

  it('shows nothing while the status is loading', () => {
    installBridge(fakeElectronBridge({ sys: { ...fakeElectronBridge().sys, pwshStatus: () => new Promise<PwshStatus>(() => {}) } }));
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('explains what is missing, offers the install command, and re-checks on demand', async () => {
    let available = false;
    const pwshStatus = vi.fn(async (_refresh?: boolean): Promise<PwshStatus> => (available ? { available: true } : { available: false, reason: 'pwsh.exe not found' }));
    const { fixture, el } = await render(pwshStatus);
    expect(el.querySelector('#content')).toBeNull();
    expect(el.textContent).toContain('PowerShell 7 is required for Script runner.');
    expect(el.textContent).toContain('pwsh.exe not found');
    expect(el.textContent).toContain('winget install --id Microsoft.PowerShell');

    available = true;
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Check again')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(pwshStatus).toHaveBeenLastCalledWith(true);
    expect(el.querySelector('#content')).not.toBeNull();
  });
});
