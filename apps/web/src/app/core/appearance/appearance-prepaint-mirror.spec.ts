import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { installLocalBackend, resetLocalBackend } from '../persistence/local-backend-registry';
import { createDegradedMemoryBackend } from '../persistence/device-store/device-kv-backend';
import { AppearanceService } from './appearance.service';
import { APPEARANCE_PREPAINT_KEY, mirrorAppearanceForPrepaint } from './appearance-prepaint-mirror';

describe('appearance pre-paint mirror', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    resetLocalBackend();
    localStorage.clear();
  });

  it('writes the value under the key the pre-paint script reads', () => {
    mirrorAppearanceForPrepaint({ mode: 'light' });
    expect(localStorage.getItem(APPEARANCE_PREPAINT_KEY)).toBe('{"mode":"light"}');
  });

  it('AppearanceService mirrors into localStorage when a non-window backend owns local state', async () => {
    installLocalBackend(createDegradedMemoryBackend());
    TestBed.inject(AppearanceService);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(localStorage.getItem(APPEARANCE_PREPAINT_KEY)).not.toBeNull();
  });
});
