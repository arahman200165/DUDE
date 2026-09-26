import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { OverlayContainer } from '@angular/cdk/overlay';
import { routes } from '../../core/routing/app.routes';
import { TOOL_DEFINITIONS } from '../../core/registry/tool-definitions';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { CommandPaletteService } from './command-palette.service';

describe('CommandPalette', () => {
  let service: CommandPaletteService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
    service = TestBed.inject(CommandPaletteService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    service.close();
    TestBed.inject(OverlayContainer).ngOnDestroy();
  });

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('opens with the search input auto-focused', async () => {
    service.open();
    await stable();

    const input = document.querySelector<HTMLInputElement>('input');
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('filters results as the query changes', async () => {
    service.open();
    await stable();

    const input = document.querySelector<HTMLInputElement>('input')!;

    input.value = 'json';
    input.dispatchEvent(new Event('input'));
    await stable();
    expect(document.querySelectorAll('button').length).toBeGreaterThan(0);

    input.value = 'zzz-nonexistent';
    input.dispatchEvent(new Event('input'));
    await stable();
    expect(document.querySelectorAll('button').length).toBe(0);
  });

  it('navigates to the selected tool and closes on Enter', async () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    service.open();
    await stable();

    const input = document.querySelector<HTMLInputElement>('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await stable();

    // With an empty query the palette's default order is TOOL_DEFINITIONS' registration
    // order grouped by category (TOOL_CATEGORIES order) — compute the expected first result
    // the same way instead of hard-coding a tool id, which shifts whenever the (now
    // alphabetically-generated, per Phase 22) registry order does.
    const firstCategoryWithTools = TOOL_CATEGORIES.find((category) =>
      TOOL_DEFINITIONS.some((tool) => tool.category === category),
    )!;
    const expectedFirstTool = TOOL_DEFINITIONS.find((tool) => tool.category === firstCategoryWithTools)!;

    expect(navigateSpy).toHaveBeenCalledWith(expectedFirstTool.route);
    expect(document.querySelector('input')).toBeNull();
  });

  it('closes without navigating on Escape', async () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    service.open();
    await stable();

    const input = document.querySelector<HTMLInputElement>('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await stable();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(document.querySelector('input')).toBeNull();
  });

  it('wraps from the first result to the last on ArrowUp', async () => {
    service.open();
    await stable();

    const input = document.querySelector<HTMLInputElement>('input')!;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.length).toBeGreaterThan(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await stable();

    const selected = document.querySelectorAll<HTMLButtonElement>('button.border-l-accent');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(buttons.at(-1));
  });

  it('wraps from the last result back to the first on ArrowDown', async () => {
    service.open();
    await stable();

    const input = document.querySelector<HTMLInputElement>('input')!;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));

    for (let i = 0; i < buttons.length; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    await stable();

    const selected = document.querySelectorAll<HTMLButtonElement>('button.border-l-accent');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(buttons[0]);
  });
});
