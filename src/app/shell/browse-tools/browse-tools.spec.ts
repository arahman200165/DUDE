import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { BrowseTools } from './browse-tools';

const SORT_KEY = 'dude:v1:__browse_tools__:sortMode';

describe('BrowseTools persisted preferences (Phase 30I.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function mount(url = '/tools') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'tools', component: BrowseTools }])] });
    window.history.replaceState({}, '', url);
    const fixture = TestBed.createComponent(BrowseTools);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as unknown as { sortMode: { (): string; set(v: string): void } } };
  }

  it('remembers the chosen sort mode across sessions', async () => {
    const first = mount();
    first.component.sortMode.set('alpha');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(localStorage.getItem(SORT_KEY)).toBe('"alpha"');

    expect(mount().component.sortMode()).toBe('alpha');
  });

  it('falls back to the default for an invalid stored sort mode', () => {
    localStorage.setItem(SORT_KEY, '"sideways"');
    expect(mount().component.sortMode()).toBe('recommended');
  });

  it('never persists search text or filters', async () => {
    const { fixture } = mount();
    (fixture.componentInstance as unknown as { query: { set(v: string): void } }).query.set('secret-token-value');
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();

    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '').join('\n');
    expect(stored).not.toContain('secret-token-value');
  });

  it('is removed by Clear all local data', async () => {
    const { component } = mount();
    component.sortMode.set('category');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(localStorage.getItem(SORT_KEY)).not.toBeNull();
    TestBed.inject(PersistenceService).clearAll();
    expect(localStorage.getItem(SORT_KEY)).toBeNull();
  });
});
