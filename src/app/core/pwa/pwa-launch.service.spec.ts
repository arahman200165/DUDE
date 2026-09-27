import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../platform/platform.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { readStorageValue } from '../workspace/workspace-storage-bridge';
import { PwaLaunchService } from './pwa-launch.service';

describe('PwaLaunchService (manifest file_handlers)', () => {
  let opened: string[];

  function create() {
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: { isDesktop: () => false } },
        { provide: ToolLauncherService, useValue: { open: (tool: { id: string }) => opened.push(tool.id) } },
      ],
    });
    return TestBed.inject(PwaLaunchService);
  }
  const handle = (name: string, text: string) => ({ getFile: async () => new File([text], name) }) as unknown as FileSystemFileHandle;

  afterEach(() => sessionStorage.clear());

  it('routes a launched file to the tool that claims its extension, prefilled, without running anything', async () => {
    const service = create();
    await service.open({ files: [handle('data.json', '{"a":1}')] });
    expect(opened).toEqual(['json']);
    expect(readStorageValue('json', 'input', 'session')).toBe('{"a":1}');
  });

  it('explains an unsupported file type instead of silently doing nothing', async () => {
    const service = create();
    await service.open({ files: [handle('photo.xyz', '')] });
    expect(opened).toEqual([]);
    expect(service.error()).toContain('.xyz');
  });
});
