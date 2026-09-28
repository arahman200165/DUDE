import { TestBed } from '@angular/core/testing';
import { HomePanelService } from '../../../core/home-panel/home-panel.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { HomeNotesPanel } from './home-notes-panel';

describe('HomeNotesPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });

  function render() {
    const fixture = TestBed.createComponent(HomeNotesPanel);
    fixture.detectChanges();
    return fixture;
  }
  const el = (f: { nativeElement: HTMLElement }) => f.nativeElement;
  const buttonByText = (root: HTMLElement, text: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

  it('starts as an empty prompt with an Add note action and no editor', () => {
    const fixture = render();

    expect(el(fixture).textContent).toContain('stored only on this device');
    expect(el(fixture).querySelector('textarea')).toBeNull();
    expect(buttonByText(el(fixture), 'Add note')).toBeDefined();
  });

  it('shows the storage disclosure in the editor, covering local storage, backup and Clear All', () => {
    const fixture = render();
    buttonByText(el(fixture), 'Add note')!.click();
    fixture.detectChanges();

    const disclosure = el(fixture).querySelector('[data-testid="storage-disclosure"]')!.textContent!;
    expect(disclosure).toContain('this device only');
    expect(disclosure).toContain('never sent to a service');
    expect(disclosure).toContain('backups');
    expect(disclosure).toContain('Clear all local data');
    expect(disclosure).toContain('contacts that site');
  });

  it('saves the note as plain text, escaping any markup', () => {
    const fixture = render();
    buttonByText(el(fixture), 'Add note')!.click();
    fixture.detectChanges();

    const textarea = el(fixture).querySelector('textarea')!;
    textarea.value = '<img src=x onerror=alert(1)> todo';
    textarea.dispatchEvent(new Event('input'));
    buttonByText(el(fixture), 'Done')!.click();
    fixture.detectChanges();

    expect(TestBed.inject(HomePanelService).note()).toBe('<img src=x onerror=alert(1)> todo');
    expect(el(fixture).querySelector('img')).toBeNull();
    expect(el(fixture).textContent).toContain('<img src=x onerror=alert(1)> todo');
  });

  function addLink(fixture: ReturnType<typeof render>, label: string, url: string) {
    const label$ = el(fixture).querySelector('input[aria-label="Link label"]') as HTMLInputElement;
    const url$ = el(fixture).querySelector('input[aria-label="Link address"]') as HTMLInputElement;
    label$.value = label;
    url$.value = url;
    buttonByText(el(fixture), 'Add link')!.click();
    fixture.detectChanges();
  }

  it('adds a valid link as a safe external anchor on the web', () => {
    const fixture = render();
    buttonByText(el(fixture), 'Add note')!.click();
    fixture.detectChanges();

    addLink(fixture, 'Docs', 'https://example.com');

    const anchor = el(fixture).querySelector('ul a') as HTMLAnchorElement;
    expect(anchor.textContent).toContain('Docs');
    expect(anchor.getAttribute('href')).toBe('https://example.com/');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('rejects an unsafe link with a visible error and stores nothing', () => {
    const fixture = render();
    buttonByText(el(fixture), 'Add note')!.click();
    fixture.detectChanges();

    addLink(fixture, 'Bad', 'javascript:alert(1)');

    expect(el(fixture).querySelector('[role="alert"]')?.textContent).toContain('http://');
    expect(TestBed.inject(HomePanelService).links()).toEqual([]);
  });

  it('removes a link from the editor', () => {
    const service = TestBed.inject(HomePanelService);
    service.addLink('Docs', 'https://example.com');
    const fixture = render();

    buttonByText(el(fixture), 'Edit')!.click();
    fixture.detectChanges();
    (el(fixture).querySelector('button[aria-label="Remove link Docs"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.links()).toEqual([]);
  });

  describe('on desktop', () => {
    afterEach(() => {
      delete (window as { dude?: unknown }).dude;
    });

    function renderDesktop(open: ReturnType<typeof vi.fn>) {
      (window as unknown as { dude: unknown }).dude = { external: { open } };
      TestBed.overrideProvider(PlatformService, { useValue: { isDesktop: () => true } });
      TestBed.inject(HomePanelService).addLink('Docs', 'https://example.com');
      return render();
    }

    it('sends a link click through the external-open bridge instead of navigating', async () => {
      const open = vi.fn().mockResolvedValue({ ok: true });
      const fixture = renderDesktop(open);

      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      (el(fixture).querySelector('ul a') as HTMLAnchorElement).dispatchEvent(click);
      await fixture.whenStable();

      expect(click.defaultPrevented).toBe(true);
      expect(open).toHaveBeenCalledWith('https://example.com/');
    });

    it('shows an error when main refuses the link', async () => {
      const fixture = renderDesktop(vi.fn().mockResolvedValue({ ok: false, error: 'Only http:// and https:// links can be opened.' }));

      (el(fixture).querySelector('ul a') as HTMLAnchorElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el(fixture).querySelector('[role="alert"]')?.textContent).toContain('Only http://');
    });
  });

  it('leaves a normal anchor click alone on the web', () => {
    TestBed.inject(HomePanelService).addLink('Docs', 'https://example.com');
    const fixture = render();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    (el(fixture).querySelector('ul a') as HTMLAnchorElement).dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
  });
});
