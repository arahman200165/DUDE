import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HubWebSignOut } from './hub-web-sign-out.service';
import { HubWebSyncInfo } from './hub-web-sync-info';

describe('HubWebSignOut.request', () => {
  it('holds the session-expiry redirect back while the request is out and after it succeeds', async () => {
    const info = TestBed.inject(HubWebSyncInfo);
    let during: boolean | undefined;
    await TestBed.inject(HubWebSignOut).request(async () => {
      during = info.signingOut;
    });
    expect(during).toBe(true);
    expect(info.signingOut).toBe(true);
  });

  it('releases it when the request fails', async () => {
    const info = TestBed.inject(HubWebSyncInfo);
    const failure = new Error('refused');
    await expect(TestBed.inject(HubWebSignOut).request(() => Promise.reject(failure))).rejects.toBe(failure);
    expect(info.signingOut).toBe(false);
  });
});
