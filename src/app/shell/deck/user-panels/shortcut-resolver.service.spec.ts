import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformService } from '../../../core/platform/platform.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';
import { COMMAND_SOURCE, PaletteCommand } from '../../../shared/models/command-source.model';
import { ShortcutResolverService } from './shortcut-resolver.service';

const tool = TOOL_DEFINITIONS[0];
let desktop = false;
const execute = vi.fn();
const commands: PaletteCommand[] = [
  { id: 'pipeline:run:abc', kind: 'pipeline', title: 'Run pipeline', execute },
  { id: 'native:desktop-thing', kind: 'native', title: 'Desktop thing', desktopOnly: true, execute },
  { id: 'recent:tool:x', kind: 'recent', title: 'Recent thing', execute },
  { id: `tool:${tool.id}`, kind: 'tool', title: tool.title, execute },
];
const navigateByUrl = vi.fn().mockResolvedValue(true);
const open = vi.fn();

describe('ShortcutResolverService', () => {
  let resolver: ShortcutResolverService;

  beforeEach(() => {
    desktop = false;
    execute.mockClear();
    navigateByUrl.mockClear();
    open.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: COMMAND_SOURCE, multi: true, useValue: { commands: () => commands } },
        { provide: Router, useValue: { navigateByUrl } },
        { provide: ToolLauncherService, useValue: { open } },
        { provide: PlatformService, useValue: { isDesktop: () => desktop } },
      ],
    });
    resolver = TestBed.inject(ShortcutResolverService);
  });

  const target = (kind: 'tool' | 'destination' | 'settings' | 'command', ref: string) => ({ id: 't', kind, ref, label: '' });

  it('resolving never runs anything', () => {
    for (const t of [target('tool', tool.id), target('destination', 'history'), target('settings', 'general'), target('command', 'pipeline:run:abc')]) {
      expect(resolver.resolve(t).available).toBe(true);
    }
    expect(execute).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('runs each kind through its own owner, only when asked', async () => {
    await resolver.run(target('tool', tool.id));
    expect(open).toHaveBeenCalledWith(tool);
    await resolver.run(target('destination', 'history'));
    expect(navigateByUrl).toHaveBeenCalledWith('/history');
    await resolver.run(target('settings', 'general'));
    expect(navigateByUrl).toHaveBeenCalledWith('/settings/general');
    await resolver.run(target('command', 'pipeline:run:abc'));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('reports missing targets as unavailable and refuses to run them', async () => {
    for (const t of [target('tool', 'gone'), target('destination', 'gone'), target('settings', 'gone'), target('settings', 'tools/gone'), target('command', 'gone')]) {
      const info = resolver.resolve(t);
      expect(info.available).toBe(false);
      expect(info.reason).toBeTruthy();
      expect(await resolver.run(t)).toBe(false);
    }
    expect(execute).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('marks desktop-only targets unavailable on the web and available on desktop', async () => {
    const t = target('command', 'native:desktop-thing');
    expect(resolver.resolve(t)).toMatchObject({ available: false, reason: 'Needs the DUDE desktop app.' });
    expect(await resolver.run(t)).toBe(false);
    expect(execute).not.toHaveBeenCalled();

    desktop = true;
    expect(resolver.resolve(t).available).toBe(true);
    expect(resolver.resolve(target('settings', 'hotkeys')).available).toBe(true);
    desktop = false;
    expect(resolver.resolve(target('settings', 'hotkeys')).available).toBe(false);
  });

  it('offers only pinnable commands and filters options by query', () => {
    const ids = resolver.options('command', '', 50).map((o) => o.ref);
    expect(ids).toContain('pipeline:run:abc');
    expect(ids).not.toContain('recent:tool:x');
    expect(ids).not.toContain(`tool:${tool.id}`);
    expect(ids).not.toContain('native:desktop-thing');

    expect(resolver.options('tool', tool.title.toLowerCase()).some((o) => o.ref === tool.id)).toBe(true);
    expect(resolver.options('destination', 'zzzz-nothing')).toEqual([]);
    // Title matches outrank description/id matches, so a search for a name finds that name first.
    const first = resolver.options('tool', TOOL_DEFINITIONS[5].title.slice(0, 6).toLowerCase(), 50);
    expect(first[0].title.toLowerCase()).toContain(TOOL_DEFINITIONS[5].title.slice(0, 6).toLowerCase());
    expect(resolver.options('tool', '', 3)).toHaveLength(3);
  });
});
