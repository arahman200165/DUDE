import { TestBed } from '@angular/core/testing';
import { FileDrop } from './file-drop';
import { FileDropHandoffService } from '../../../core/file-drop-detect/file-drop-handoff.service';
import { WORKSPACE_HOST_CONTEXT } from '../../../core/workspace/workspace-host-context';

function dispatchDrop(zone: Element, files: File[]): void {
  const event = new Event('drop', { cancelable: true }) as Event & { dataTransfer: { files: File[] } };
  event.dataTransfer = { files };
  zone.dispatchEvent(event);
}

describe('FileDrop', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the label when no file is selected', () => {
    const fixture = TestBed.createComponent(FileDrop);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Drop a file here, or click to browse');
  });

  it('emits fileSelected and filesSelected when a file is dropped', () => {
    const fixture = TestBed.createComponent(FileDrop);
    fixture.detectChanges();

    const selected: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) => selected.push(file));

    const file = new File(['abc'], 'notes.txt', { type: 'text/plain' });
    const zone: HTMLElement = fixture.nativeElement.querySelector('[role="button"]');
    dispatchDrop(zone, [file]);
    fixture.detectChanges();

    expect(selected).toEqual([file]);
    expect(fixture.nativeElement.textContent).toContain('notes.txt');
  });

  it('emits rejected instead of fileSelected when the type does not match accept', () => {
    const fixture = TestBed.createComponent(FileDrop);
    fixture.componentRef.setInput('accept', '.png');
    fixture.detectChanges();

    const rejections: string[] = [];
    const selected: File[] = [];
    fixture.componentInstance.rejected.subscribe((message: string) => rejections.push(message));
    fixture.componentInstance.fileSelected.subscribe((file: File) => selected.push(file));

    const file = new File(['abc'], 'notes.txt', { type: 'text/plain' });
    const zone: HTMLElement = fixture.nativeElement.querySelector('[role="button"]');
    dispatchDrop(zone, [file]);

    expect(selected).toEqual([]);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toContain('notes.txt');
  });

  it('emits fileSelected via the hidden file input change event', () => {
    const fixture = TestBed.createComponent(FileDrop);
    fixture.detectChanges();

    const selected: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) => selected.push(file));

    const file = new File(['abc'], 'picked.txt', { type: 'text/plain' });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    expect(selected).toEqual([file]);
  });

  it('does not react to drops while disabled', () => {
    const fixture = TestBed.createComponent(FileDrop);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const selected: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) => selected.push(file));

    const file = new File(['abc'], 'notes.txt', { type: 'text/plain' });
    const zone: HTMLElement = fixture.nativeElement.querySelector('[role="button"]');
    dispatchDrop(zone, [file]);

    expect(selected).toEqual([]);
  });

  describe('Smart File Drop hand-off', () => {
    function setup(options: { acceptHandoff?: boolean } = {}) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: WORKSPACE_HOST_CONTEXT, useValue: { toolId: 'file-hash' } }] });
      const file = new File(['abc'], 'handed-off.bin');
      TestBed.inject(FileDropHandoffService).offer('file-hash', file);
      const fixture = TestBed.createComponent(FileDrop);
      if (options.acceptHandoff === false) fixture.componentRef.setInput('acceptHandoff', false);
      const selected: File[] = [];
      fixture.componentInstance.fileSelected.subscribe((picked: File) => selected.push(picked));
      return { fixture, file, selected };
    }

    it("consumes a file handed off to the host tool, emits it, and shows its name", async () => {
      const { fixture, file, selected } = setup();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(selected).toEqual([file]);
      expect(fixture.nativeElement.textContent).toContain('handed-off.bin');
      expect(TestBed.inject(FileDropHandoffService).has('file-hash')).toBe(false);
    });

    it('leaves the hand-off alone when acceptHandoff is false', async () => {
      const { fixture, selected } = setup({ acceptHandoff: false });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(selected).toEqual([]);
      expect(TestBed.inject(FileDropHandoffService).has('file-hash')).toBe(true);
    });
  });
});
