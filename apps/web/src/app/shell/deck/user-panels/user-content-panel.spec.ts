import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { PANEL_CONTEXT } from '../../../shared/models/panel-context.model';
import { COMMAND_SOURCE, PaletteCommand } from '../../../shared/models/command-source.model';
import { UserContentPanel } from './user-content-panel';
import { signal } from '@angular/core';

const execute = vi.fn();
const command: PaletteCommand = { id: 'pipeline:run:abc', kind: 'pipeline', title: 'Run pipeline', execute };

function mount(instanceId: string, kindContent: Parameters<HomeLayoutService['setContent']>[1] | null, kindId = 'user-text') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: COMMAND_SOURCE, multi: true, useValue: { commands: () => [command] } },
      { provide: PANEL_CONTEXT, useValue: { instanceId, config: signal({}) } },
    ],
  });
  const layout = TestBed.inject(HomeLayoutService);
  if (kindId !== 'user-text' || kindContent) {
    // Ensure the instance exists (the default layout only contains user-text and user-links).
    if (!layout.layout().instances.some((i) => i.id === instanceId)) layout.appendInstance(kindId);
  }
  if (kindContent) layout.setContent(instanceId, kindContent);
  const fixture = TestBed.createComponent(UserContentPanel);
  fixture.detectChanges();
  return { fixture, layout, el: fixture.nativeElement as HTMLElement };
}

describe('UserContentPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    execute.mockClear();
  });

  it('shows an inviting empty state and no editor until asked', () => {
    const { el } = mount('user-text', null);
    expect(el.textContent).toContain('stored only on this device');
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('renders a text note as inert plain text, never markup', () => {
    const { el } = mount('user-text', { kind: 'text', title: 'Todo', text: '<img src=x onerror=alert(1)><b>bold</b>' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)><b>bold</b>');
    expect(el.textContent).toContain('Todo');
  });

  it('renders saved links as noopener anchors and opens nothing on mount', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { el } = mount('user-links', { kind: 'link', title: '', links: [{ id: 'a', label: 'Docs', url: 'https://example.com/docs' }] }, 'user-links');
    const a = el.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://example.com/docs');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('rejects javascript: and data: links at the editor, so they never reach the store', () => {
    const { el, fixture, layout } = mount('user-links', { kind: 'link', title: '', links: [] }, 'user-links');
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Add content')) as HTMLButtonElement)?.click();
    fixture.detectChanges();
    const addBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Edit') || b.textContent?.includes('Done'));
    if (!el.querySelector('app-user-content-editor')) addBtn?.click();
    fixture.detectChanges();

    const url = el.querySelector('input[aria-label="Link address"]') as HTMLInputElement;
    const add = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add link') as HTMLButtonElement;
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///C:/secrets']) {
      url.value = bad;
      add.click();
      fixture.detectChanges();
      expect(el.textContent).toContain('http:// or https://');
    }
    expect(layout.contentOf('user-links')).toBeUndefined();
  });

  it('runs a shortcut only when clicked, and shows unavailable targets disabled', async () => {
    const { el, fixture, layout } = mount(
      'user-shortcuts',
      {
        kind: 'shortcut',
        title: '',
        targets: [
          { id: 's1', kind: 'command', ref: 'pipeline:run:abc', label: '' },
          { id: 's2', kind: 'tool', ref: 'missing-tool', label: '' },
        ],
      },
      'user-shortcuts',
    );
    expect(layout.contentOf('user-shortcuts')).toBeDefined();
    expect(execute).not.toHaveBeenCalled();

    const buttons = Array.from(el.querySelectorAll('button')).filter((b) => b.textContent?.includes('Run pipeline') || b.textContent?.includes('Unavailable'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);

    buttons[0].click();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
