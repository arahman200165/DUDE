import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RichTextEditor } from './rich-text-editor';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('RichTextEditor component', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    // jsdom implements neither `navigator.clipboard` nor `URL.createObjectURL` —
    // define them directly rather than `vi.stubGlobal`/`vi.spyOn`, which would
    // either replace `URL`'s constructor identity (breaking Angular internals
    // that do `new URL(...)`) or fail to spy on a property that doesn't exist.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists editor content changes to session storage', async () => {
    const fixture = TestBed.createComponent(RichTextEditor);
    fixture.detectChanges();
    await stable();

    fixture.componentInstance['tiptap']?.editor()?.commands.setContent('<p>persisted</p>');
    fixture.detectChanges();

    expect(fixture.componentInstance['contentHtml']()).toContain('persisted');
  });

  it('copies the current HTML to the clipboard', async () => {
    const fixture = TestBed.createComponent(RichTextEditor);
    fixture.detectChanges();
    await stable();

    fixture.componentInstance['tiptap']?.editor()?.commands.setContent('<p>hello</p>');
    fixture.detectChanges();
    fixture.componentInstance['copyHtml']();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('hello'));
  });

  it('copies the current content as Markdown', async () => {
    const fixture = TestBed.createComponent(RichTextEditor);
    fixture.detectChanges();
    await stable();

    fixture.componentInstance['tiptap']?.editor()?.commands.setContent('<p><strong>bold</strong></p>');
    fixture.detectChanges();
    fixture.componentInstance['copyMarkdown']();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('**bold**'));
  });

  it('resets the editor content on clear()', async () => {
    const fixture = TestBed.createComponent(RichTextEditor);
    fixture.detectChanges();
    await stable();

    fixture.componentInstance['tiptap']?.editor()?.commands.setContent('<p>temporary</p>');
    fixture.detectChanges();
    fixture.componentInstance['clear']();
    fixture.detectChanges();

    expect(fixture.componentInstance['contentHtml']()).not.toContain('temporary');
  });

  it('downloads HTML and Markdown files', async () => {
    const fixture = TestBed.createComponent(RichTextEditor);
    fixture.detectChanges();
    await stable();

    fixture.componentInstance['downloadHtml']();
    fixture.componentInstance['downloadMarkdown']();

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });
});
