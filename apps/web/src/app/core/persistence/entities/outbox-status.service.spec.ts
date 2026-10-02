import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHealth } from '@dude/contracts';
import { fakeElectronBridge, fakeStore } from '../../platform/testing/fake-electron-bridge';
import { OutboxStatusService } from './outbox-status.service';

describe('OutboxStatusService', () => {
  afterEach(() => {
    delete (window as { dude?: unknown }).dude;
  });

  it('is null on web', () => {
    expect(TestBed.inject(OutboxStatusService).status()).toBeNull();
  });

  it('reads status, follows health events and refreshes after commits', async () => {
    let outbox = { pending: 2, maxRows: 10, backpressure: false };
    let onHealth: (h: StoreHealth) => void = () => {};
    const store = {
      ...fakeStore(),
      status: async () => ({ outbox }) as StoreHealth,
      onHealth: (cb: (h: StoreHealth) => void) => {
        onHealth = cb;
        return () => {};
      },
    };
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ store }), configurable: true, writable: true });
    const service = TestBed.inject(OutboxStatusService);
    await service.refresh();
    expect(service.status()).toEqual({ pending: 2, maxRows: 10, backpressure: false });
    outbox = { pending: 10, maxRows: 10, backpressure: true };
    service.noteCommit(true);
    await service.refresh();
    expect(service.status()?.backpressure).toBe(true);
    onHealth({ outbox: { pending: 0, maxRows: 10, backpressure: false } } as StoreHealth);
    expect(service.status()?.pending).toBe(0);
  });
});
