import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../platform/platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { readStorageValue, writeStorageValue } from '../workspace/workspace-storage-bridge';
import { ShareLinkService, WEB_COMPANION_BASE_URL } from './share-link.service';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import { textFileInputOf } from '../text-file-input/imported-file-flags';

describe('ShareLinkService', () => {
  const shareable = TOOL_DEFINITIONS.find((tool) => tool.id === 'json')!;
  const input = textFileInputOf(shareable)!;
  const htmlPreview = TOOL_DEFINITIONS.find((tool) => tool.id === 'html-preview')!;

  function create(desktop = false, hostKind: 'desktop' | 'web-standalone' | 'hub-web' = desktop ? 'desktop' : 'web-standalone') {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => desktop, hostKind } }] });
    return TestBed.inject(ShareLinkService);
  }

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('builds a bare, data-free tool URL on the web from the current base href', () => {
    const url = create().linkFor('json')!;
    expect(url).toBe(new URL('tools/json', document.baseURI).href);
    expect(url).not.toContain('#');
  });

  it('points desktop links at the public web companion, never the private loopback server', () => {
    expect(create(true).linkFor('json')).toBe(`${WEB_COMPANION_BASE_URL}tools/json`);
  });

  it('on Hub web keeps the Hub-origin link as primary and adds a public companion link with the same path', () => {
    const service = create(false, 'hub-web');
    expect(service.isHubWeb()).toBe(true);
    expect(service.linkFor('json')).toBe(new URL('tools/json', document.baseURI).href);
    expect(service.publicCompanionLinkFor('json')).toBe(`${WEB_COMPANION_BASE_URL}tools/json`);
    expect(service.publicCompanionLinkFor('no-such-tool')).toBeNull();
  });

  it('offers no separate public link on standalone web or desktop', () => {
    expect(create().publicCompanionLinkFor('json')).toBeNull();
    TestBed.resetTestingModule();
    expect(create(true).publicCompanionLinkFor('json')).toBeNull();
  });

  it('round-trips the tool input through a link: sender reads its storage, receiver writes it back', async () => {
    const service = create();
    writeStorageValue('json', input.key, input.policy ?? 'session', '{"hello":"world"}');
    const result = await service.linkWithInputFor('json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    sessionStorage.clear();
    const fragment = new URL(result.url).hash;
    expect(await service.receive('json', fragment)).toBe(true);
    expect(readStorageValue('json', input.key, input.policy ?? 'session')).toBe('{"hello":"world"}');
    expect(service.received()).toBe('json');
  });

  it('refuses to build a link for empty input or a tool with no text input', async () => {
    const service = create();
    expect(await service.linkWithInputFor('json')).toEqual({ ok: false, reason: 'empty' });
    const noInput = TOOL_DEFINITIONS.find((tool) => !textFileInputOf(tool))!;
    expect(service.canShareInput(noInput.id)).toBe(false);
    expect(await service.linkWithInputFor(noInput.id)).toEqual({ ok: false, reason: 'not-shareable' });
  });

  it('treats received input like an imported file, so HTML Preview asks before rendering it', async () => {
    const service = create();
    writeStorageValue('html-preview', textFileInputOf(htmlPreview)!.key, 'session', '<script>alert(1)</script>');
    const result = await service.linkWithInputFor('html-preview');
    sessionStorage.clear();

    await service.receive('html-preview', new URL((result as { url: string }).url).hash);
    expect(sessionStorage.getItem('dude:desktop:html-preview-manual')).toBe('true');
  });

  it('ignores foreign fragments and never writes anything for them', async () => {
    const service = create();
    expect(await service.receive('json', '#section-2')).toBe(false);
    expect(await service.receive('json', '#in=v1.!!!')).toBe(false);
    expect(readStorageValue('json', input.key, 'session')).toBeUndefined();
    expect(service.received()).toBeNull();
  });

  it('only ever writes through text inputs declared session or user-choice, never a secret tier', () => {
    for (const tool of TestBed.inject(ToolRegistryService).getAll()) {
      const declared = textFileInputOf(tool);
      if (declared) expect(['session', 'user-choice']).toContain(declared.policy ?? 'session');
    }
  });
});
