import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { SmartFileDropZone } from './smart-file-drop-zone';
import { FileDropHandoffService } from '../../../core/file-drop-detect/file-drop-handoff.service';
import { readStorageValue } from '../../../core/workspace/workspace-storage-bridge';

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

  async function dropAndOpen(file: File, candidateTitle: string) {
    const fixture = TestBed.createComponent(SmartFileDropZone);
    fixture.detectChanges();
    dispatchDrop(fixture.nativeElement.querySelector('[role="button"]')!, [file]);
    await flush();
    fixture.detectChanges();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes(candidateTitle),
    ) as HTMLButtonElement;
    button.click();
    await flush();
    return fixture;
  }

  it("writes a text file's contents into a text tool's input and navigates when a candidate is opened", async () => {
    await dropAndOpen(new File(['{"a":1}'], 'data.json', { type: 'application/json' }), 'JSON Formatter');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/json');
    expect(readStorageValue('json', 'input', 'session')).toBe('{"a":1}');
    sessionStorage.clear();
  });

  it('offers the File itself via FileDropHandoffService to a tool with no text input', async () => {
    const file = new File([new Uint8Array([0, 1, 2])], 'blob');
    await dropAndOpen(file, 'File Hash');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/file-hash');
    expect(TestBed.inject(FileDropHandoffService).consume('file-hash')).toBe(file);
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
