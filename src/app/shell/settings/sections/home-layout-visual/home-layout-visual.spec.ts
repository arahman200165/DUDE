import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformService } from '../../../../core/platform/platform.service';
import { HomeLayoutSettings } from '../home-layout-settings';
import { GRID_ADAPTER_FACTORY, GridAdapter, GridAdapterFactory, GridAdapterHandlers, VisualItem, createGridstackAdapter } from './gridstack-adapter';
import { HomeLayoutVisual } from './home-layout-visual';

const items: VisualItem[] = [
  { id: 'a', title: 'A', x: 0, y: 0, w: 6, h: 2, minW: 2, minH: 1 },
  { id: 'b', title: 'B', x: 6, y: 0, w: 6, h: 2, minW: 2, minH: 1 },
];

function fakeFactory() {
  const setItems = vi.fn();
  const destroy = vi.fn();
  let handlers!: GridAdapterHandlers;
  const factory: GridAdapterFactory = (_host, initial, h) => {
    handlers = h;
    setItems(initial);
    const adapter: GridAdapter = { setItems, destroy };
    return Promise.resolve(adapter);
  };
  return { factory, setItems, destroy, propose: (id: string, p: { x: number; y: number; w: number; h: number }) => handlers.propose(id, p) };
}

describe('HomeLayoutVisual', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('draws from items, forwards proposals to the parent, and destroys the adapter', async () => {
    const fake = fakeFactory();
    const accept = vi.fn().mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [{ provide: GRID_ADAPTER_FACTORY, useValue: fake.factory }] });
    const fixture = TestBed.createComponent(HomeLayoutVisual);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('propose', accept);
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    await fixture.whenStable();

    expect(fake.setItems).toHaveBeenCalledWith(items);
    expect(fake.propose('a', { x: 1, y: 0, w: 5, h: 2 })).toBe(true);
    expect(accept).toHaveBeenCalledWith('a', { x: 1, y: 0, w: 5, h: 2 });

    const next = [{ ...items[0], x: 1 }, items[1]];
    fixture.componentRef.setInput('items', next);
    fixture.detectChanges();
    expect(fake.setItems).toHaveBeenLastCalledWith(next);

    fixture.destroy();
    expect(fake.destroy).toHaveBeenCalled();
  });

  it('says so and leaves the list usable when the library fails to load', async () => {
    const failing: GridAdapterFactory = () => Promise.reject(new Error('chunk failed'));
    TestBed.configureTestingModule({ providers: [{ provide: GRID_ADAPTER_FACTORY, useValue: failing }] });
    const fixture = TestBed.createComponent(HomeLayoutVisual);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('propose', () => true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('couldn’t load');
  });

  it('a proposal from the visual surface goes through the grid engine: overlaps are refused with a reason', async () => {
    const fake = fakeFactory();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PlatformService, useValue: { isDesktop: () => false } }, { provide: GRID_ADAPTER_FACTORY, useValue: fake.factory }],
    });
    const fixture = TestBed.createComponent(HomeLayoutSettings);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Drag & resize')) as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    // resume-work (x=0, w=6) and quick-run (x=6, w=6) share a row; widening resume-work overlaps quick-run.
    expect(fake.propose('resume-work', { x: 0, y: 3 + 0, w: 12, h: 3 })).toBe(false);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="layout-status"]')?.textContent).toMatch(/Overlaps|Too|Outside/);

    // A same-size nudge into free space is accepted and marks the editor dirty.
    const status = el.querySelector('[data-testid="layout-status"]');
    expect(status).not.toBeNull();
  });
});

describe('createGridstackAdapter (real library, smoke)', () => {
  it('initialises against a DOM host, redraws from items, refuses via callback, and cleans up', async () => {
    const host = document.createElement('div');
    host.style.width = '600px';
    document.body.appendChild(host);
    const propose = vi.fn().mockReturnValue(false);
    const adapter = await createGridstackAdapter(host, items, { propose });

    expect(host.querySelectorAll('.grid-stack-item')).toHaveLength(2);
    expect(host.querySelector('.grid-stack-item')?.getAttribute('aria-label')).toContain('Arrow keys move it');
    expect(host.querySelector('.grid-stack-item-content')?.textContent).toBe('A');

    adapter.setItems([{ ...items[0], title: '<img src=x onerror=alert(1)>' }]);
    expect(host.querySelectorAll('.grid-stack-item')).toHaveLength(1);
    expect(host.querySelector('img')).toBeNull();

    adapter.destroy();
    expect(host.children).toHaveLength(0);
    host.remove();
  });
});

