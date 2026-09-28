import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkService } from './external-link.service';
import { PlatformService } from './platform.service';

describe('ExternalLinkService', () => {
  afterEach(() => {
    delete (window as { dude?: unknown }).dude;
    vi.restoreAllMocks();
  });

  function create(isDesktop: boolean) {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => isDesktop } }] });
    return TestBed.inject(ExternalLinkService);
  }

  it('routes desktop opens through the bridge and returns its result', async () => {
    const open = vi.fn().mockResolvedValue({ ok: true });
    (window as unknown as { dude: unknown }).dude = { external: { open } };
    const service = create(true);

    expect(service.isHandledNatively()).toBe(true);
    await expect(service.open('https://example.com/')).resolves.toEqual({ ok: true });
    expect(open).toHaveBeenCalledWith('https://example.com/');
  });

  it('surfaces a refusal from main instead of swallowing it', async () => {
    (window as unknown as { dude: unknown }).dude = { external: { open: vi.fn().mockResolvedValue({ ok: false, error: 'nope' }) } };
    await expect(create(true).open('https://example.com/')).resolves.toEqual({ ok: false, error: 'nope' });
  });

  it('opens with noopener/noreferrer on the web and never touches a bridge', async () => {
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
    const service = create(false);

    expect(service.isHandledNatively()).toBe(false);
    await expect(service.open('https://example.com/')).resolves.toEqual({ ok: true });
    expect(windowOpen).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
  });
});
