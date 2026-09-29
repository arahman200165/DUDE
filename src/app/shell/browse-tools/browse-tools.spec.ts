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

describe('BrowseTools Escape (Phase 30L)', () => {
  function mountAt(url: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'tools', component: BrowseTools }])] });
    window.history.replaceState({}, '', url);
    const fixture = TestBed.createComponent(BrowseTools);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture;
  }

  it('clears the query and facets from a facet chip, then focuses the search box', () => {
    const fixture = mountAt('/tools?q=json&category=data');
    try {
      const root = fixture.nativeElement as HTMLElement;
      const search = root.querySelector<HTMLInputElement>('input[aria-label="Search tools"]')!;
      const state = fixture.componentInstance as unknown as { query: { set(v: string): void }; categoryFacet: { (): string; set(v: string): void } };
      state.query.set('json');
      state.categoryFacet.set('data');
      fixture.detectChanges();
      expect(search.value).toBe('json');
      const chip = root.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
      chip.focus();
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(search.value).toBe('');
      expect(state.categoryFacet()).toBe('all');
      expect(document.activeElement).toBe(search);
    } finally {
      fixture.nativeElement.remove();
    }
  });
});
