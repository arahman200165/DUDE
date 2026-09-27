import { DestroyRef, Directive, ElementRef, inject, input, signal } from '@angular/core';
import { OpenTextFile } from './open-text-file';

/**
 * Makes any input surface (a `<textarea>`, or the element wrapping a CodeMirror/rich editor) accept
 * a dropped file, loading it through its paired `app-open-text-file` so both paths validate and
 * display identically. Listens in the capture phase so an embedded editor's own drop handling
 * (CodeMirror inserts dropped file text at the caret) never sees a file drop; plain text drags are
 * left alone. `data-dude-file-drop` tells the desktop window-level drop router to stand aside.
 */
@Directive({
  selector: '[appTextFileDrop]',
  host: {
    'data-dude-file-drop': '',
    '[class.ring-1]': 'dragOver()',
    '[class.ring-accent]': 'dragOver()',
  },
})
export class TextFileDrop {
  readonly appTextFileDrop = input.required<OpenTextFile>();
  protected readonly dragOver = signal(false);

  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer!.dropEffect = 'copy';
      this.dragOver.set(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) this.dragOver.set(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      this.dragOver.set(false);
      const file = event.dataTransfer?.files[0];
      if (file) void this.appTextFileDrop().load(file);
    };

    element.addEventListener('dragover', onDragOver, true);
    element.addEventListener('dragleave', onDragLeave, true);
    element.addEventListener('drop', onDrop, true);
    inject(DestroyRef).onDestroy(() => {
      element.removeEventListener('dragover', onDragOver, true);
      element.removeEventListener('dragleave', onDragLeave, true);
      element.removeEventListener('drop', onDrop, true);
    });
  }
}
