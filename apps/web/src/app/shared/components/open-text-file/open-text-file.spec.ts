import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OpenTextFile } from './open-text-file';
import { TextFileDrop } from './text-file-drop.directive';
import { WORKSPACE_HOST_CONTEXT } from '../../../core/workspace/workspace-host-context';
import { TextInputHandoffService } from '../../../core/text-file-input/text-input-handoff.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';

@Component({
  imports: [OpenTextFile, TextFileDrop],
  template: `
    <app-open-text-file #open [text]="value()" (textLoaded)="value.set($event)" />
    <textarea [appTextFileDrop]="open" [value]="value()"></textarea>
  `,
})
class Host {
  readonly value = signal('');
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function dispatchFileDrop(target: Element, file: File): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
  event.dataTransfer = { types: ['Files'], files: [file] };
  target.dispatchEvent(event);
  return event;
}

describe('OpenTextFile + appTextFileDrop', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: WORKSPACE_HOST_CONTEXT, useValue: { toolId: 'markdown' } }] });
  });

  it('loads a file dropped onto the paired input and shows its name until the text is edited', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const event = dispatchFileDrop(fixture.nativeElement.querySelector('textarea'), new File(['# Dropped'], 'notes.md'));
    await flush();
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.value()).toBe('# Dropped');
    expect(fixture.nativeElement.textContent).toContain('notes.md');

    fixture.componentInstance.value.set('# Edited');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('notes.md');
  });

  it('marks the input so the desktop window-level drop router stands aside', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea').hasAttribute('data-dude-file-drop')).toBe(true);
  });

  it('rejects a binary file with a visible reason and leaves the input untouched', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    dispatchFileDrop(fixture.nativeElement.querySelector('textarea'), new File([new Uint8Array([0x89, 0, 1])], 'image.png'));
    await flush();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('image.png');
  });

  it("defaults the picker filter to the host tool's declared extensions", () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="file"]').getAttribute('accept')).toBe('.md,.markdown,.mdown');
  });

  it('shows the name of a file handed off from the dashboard', () => {
    const markdown = TestBed.inject(ToolRegistryService).getById('markdown')!;
    TestBed.inject(TextInputHandoffService).offer(markdown, '# From dashboard', 'dropped.md');
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set('# From dashboard');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('dropped.md');
    sessionStorage.clear();
  });
});
