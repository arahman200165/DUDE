import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../platform/platform.service';
import { DesktopHandoffService, HANDOFF_DETECT_MS } from './desktop-handoff.service';

describe('DesktopHandoffService', () => {
  let clicked: string[];

  function create(desktop = false) {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => desktop } }] });
    return TestBed.inject(DesktopHandoffService);
  }

  beforeEach(() => {
    localStorage.clear();
    clicked = [];
    vi.useFakeTimers();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.getAttribute('href') ?? '');
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('launches a strictly formatted dude:// link, navigation only', () => {
    void create().open({ action: 'open', target: 'tool', id: 'json' });
    expect(clicked).toEqual(['dude://open/tool/json']);
  });

  it('reports not-detected when the page never loses focus', async () => {
    const result = create().open({ action: 'open', target: 'tool', id: 'json' });
    vi.advanceTimersByTime(HANDOFF_DETECT_MS);
    await expect(result).resolves.toBe('not-detected');
  });

  it('reports opened, and remembers Desktop DUDE is installed, when focus moves to the app', async () => {
    const service = create();
    const result = service.open({ action: 'open', target: 'tool', id: 'json' });
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(HANDOFF_DETECT_MS);
    await expect(result).resolves.toBe('opened');
    expect(service.desktopInstalled()).toBe(true);
  });

  it('never launches a link the strict parser would reject, and is inert on desktop', async () => {
    await Promise.all([create().open({ action: 'open', target: 'tool', id: '../x' }), Promise.resolve(vi.advanceTimersByTime(0))]);
    expect(clicked).toEqual([]);
    TestBed.resetTestingModule();
    void create(true).open({ action: 'open', target: 'tool', id: 'json' });
    expect(clicked).toEqual([]);
  });
});
