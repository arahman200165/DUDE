import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HubStepUpService } from './hub-step-up.service';

describe('HubStepUpService', () => {
  it('opens a prompt and resolves with the entered password', async () => {
    const service = TestBed.inject(HubStepUpService);
    expect(service.pending()).toBeNull();
    const answer = service.ask('Try again.');
    expect(service.pending()?.message).toBe('Try again.');
    service.pending()?.resolve('secret');
    await expect(answer).resolves.toBe('secret');
    expect(service.pending()).toBeNull();
  });

  it('resolves null when cancelled and has no message by default', async () => {
    const service = TestBed.inject(HubStepUpService);
    const answer = service.ask();
    expect(service.pending()?.message).toBeNull();
    service.pending()?.resolve(null);
    await expect(answer).resolves.toBeNull();
  });

  it('shows queued prompts one at a time, oldest first', async () => {
    const service = TestBed.inject(HubStepUpService);
    const first = service.ask('one');
    const second = service.ask('two');
    expect(service.pending()?.message).toBe('one');
    service.pending()?.resolve('a');
    await expect(first).resolves.toBe('a');
    expect(service.pending()?.message).toBe('two');
    service.pending()?.resolve('b');
    await expect(second).resolves.toBe('b');
    expect(service.pending()).toBeNull();
  });
});
