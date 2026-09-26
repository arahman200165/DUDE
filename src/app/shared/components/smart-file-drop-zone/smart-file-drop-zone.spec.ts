import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { SmartFileDropZone } from './smart-file-drop-zone';
import { FileDropHandoffService } from '../../../core/file-drop-detect/file-drop-handoff.service';

class FakeRouter {
  url = '/';
  navigateByUrl = vi.fn();
}

function dispatchDrop(zone: Element, files: File[]): void {
  const event = new Event('drop', { cancelable: true }) as Event & { dataTransfer: { files: File[] } };
  event.dataTransfer = { files };
  zone.dispatchEvent(event);
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SmartFileDropZone', () => {
  let router: FakeRouter;

  beforeEach(() => {
    router = new FakeRouter();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });

  it('shows ranked candidates for a dropped file matched by extension', async () => {
    const fixture = TestBed.createComponent(SmartFileDropZone);
    fixture.detectChanges();

    const file = new File(['{}'], 'data.json', { type: 'application/json' });
    const zone = fixture.nativeElement.querySelector('[role="button"]')!;
    dispatchDrop(zone, [file]);
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('data.json');
    expect(fixture.nativeElement.textContent).toContain('JSON Formatter');
  });

  it('offers the file via FileDropHandoffService and navigates when a candidate is opened', async () => {
    const fixture = TestBed.createComponent(SmartFileDropZone);
    fixture.detectChanges();
    const handoff = TestBed.inject(FileDropHandoffService);

    const file = new File(['{}'], 'data.json', { type: 'application/json' });
    const zone = fixture.nativeElement.querySelector('[role="button"]')!;
    dispatchDrop(zone, [file]);
    await flush();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('JSON Formatter'),
    ) as HTMLButtonElement;
    button.click();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/json');
    expect(handoff.consume('json')).toBe(file);
  });

  it('clear resets the candidate list (the underlying app-file-drop keeps its own last-selected display)', async () => {
    const fixture = TestBed.createComponent(SmartFileDropZone);
    fixture.detectChanges();

    const file = new File(['{}'], 'data.json', { type: 'application/json' });
    const zone = fixture.nativeElement.querySelector('[role="button"]')!;
    dispatchDrop(zone, [file]);
    await flush();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('JSON Formatter');

    const clearButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Clear',
    ) as HTMLButtonElement;
    clearButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('JSON Formatter');
  });
});
