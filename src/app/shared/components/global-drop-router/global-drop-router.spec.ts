import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../../../core/platform/platform.service';
import { QuickLauncherService } from '../../../core/platform/quick-launcher.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { FileDropHandoffService } from '../../../core/file-drop-detect/file-drop-handoff.service';
import { FileDropMatch } from '../../../core/file-drop-detect/file-drop-detectors.model';
import { GlobalDropRouter, confidentFileDropMatch } from './global-drop-router';

function match(toolId: string, score: number): FileDropMatch {
  return { toolId, title: toolId, score, reason: 'test' };
}

describe('GlobalDropRouter', () => {
  it('opens only a dominant format match automatically', () => {
    expect(confidentFileDropMatch([match('json', 0.85), match('file-hash', 0.3)])?.toolId).toBe('json');
    expect(confidentFileDropMatch([match('image', 0.8), match('exif', 0.75)])).toBeNull();
    expect(confidentFileDropMatch([match('file-hash', 0.3)])).toBeNull();
    expect(confidentFileDropMatch([])).toBeNull();
  });

  it('prevents document navigation and hands a confidently matched file to its tool', async () => {
    const tool = { id: 'json', title: 'JSON', route: '/tools/json', category: 'data', desktopOpen: { extensions: ['.json'] } };
    const offer = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: PlatformService, useValue: { isDesktop: () => true } },
      { provide: QuickLauncherService, useValue: { promote: vi.fn().mockResolvedValue(undefined) } },
      { provide: ToolRegistryService, useValue: { getAll: () => [tool], getById: (id: string) => id === 'json' ? tool : undefined } },
      { provide: ToolLauncherService, useValue: { open } },
      { provide: FileDropHandoffService, useValue: { offer } },
    ] });
    const fixture = TestBed.createComponent(GlobalDropRouter);
    const file = new File(['{"ok":true}'], 'sample.json', { type: 'application/json' });
    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [file] } });
    document.body.dispatchEvent(event);
    await fixture.whenStable();
    expect(event.defaultPrevented).toBe(true);
    expect(offer).toHaveBeenCalledWith('json', file);
    expect(open).toHaveBeenCalledWith(tool);
    fixture.destroy();
  });
});

