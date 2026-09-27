import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceLayoutService } from './workspace-layout.service';
import { resolvePreference } from './workspace-preference';

describe('resolvePreference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('uses the live workspace override when present, else falls back to the global value', () => {
    const global = signal('ws://global');
    const resolved = runInInjectionContext(TestBed.inject(Injector), () => resolvePreference('markdown', 'relayUrl', global));
    const layout = TestBed.inject(WorkspaceLayoutService);

    expect(resolved()).toEqual({ value: 'ws://global', source: 'global' });

    layout.setPreferenceOverride('markdown', 'relayUrl', 'ws://workspace');
    expect(resolved()).toEqual({ value: 'ws://workspace', source: 'workspace' });

    layout.setPreferenceOverride('markdown', 'relayUrl', null);
    global.set('ws://changed');
    expect(resolved()).toEqual({ value: 'ws://changed', source: 'global' });
  });
});
