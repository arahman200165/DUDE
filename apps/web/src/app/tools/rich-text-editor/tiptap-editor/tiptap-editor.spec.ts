import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TiptapEditor } from './tiptap-editor';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('TiptapEditor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('creates an Editor instance after the next render', async () => {
    const fixture = TestBed.createComponent(TiptapEditor);
    fixture.componentRef.setInput('initialContent', '<p>hello</p>');
    fixture.detectChanges();
    await stable();

    expect(fixture.componentInstance.editor()).not.toBeNull();
    expect(fixture.componentInstance.editor()?.getHTML()).toContain('hello');
  });

  it('bumps stateVersion on a transaction', async () => {
    const fixture = TestBed.createComponent(TiptapEditor);
    fixture.componentRef.setInput('initialContent', '<p>hello</p>');
    fixture.detectChanges();
    await stable();

    const before = fixture.componentInstance.stateVersion();
    fixture.componentInstance.editor()?.commands.setContent('<p>updated</p>');

    expect(fixture.componentInstance.stateVersion()).toBeGreaterThan(before);
  });

  it('emits sanitized HTML via contentChange on update', async () => {
    const fixture = TestBed.createComponent(TiptapEditor);
    fixture.componentRef.setInput('initialContent', '<p>hello</p>');
    fixture.detectChanges();
    await stable();

    const emitted: string[] = [];
    fixture.componentInstance.contentChange.subscribe((html: string) => emitted.push(html));

    fixture.componentInstance.editor()?.commands.setContent('<p>updated <script>alert(1)</script></p>');

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toContain('updated');
    expect(emitted[0]).not.toContain('<script');
  });

  it('returns Markdown for the current document via getMarkdown()', async () => {
    const fixture = TestBed.createComponent(TiptapEditor);
    fixture.componentRef.setInput('initialContent', '<p><strong>bold</strong></p>');
    fixture.detectChanges();
    await stable();

    expect(fixture.componentInstance.getMarkdown()).toContain('**bold**');
  });

  it('destroys the editor instance when the component is destroyed', async () => {
    const fixture = TestBed.createComponent(TiptapEditor);
    fixture.componentRef.setInput('initialContent', '<p>hello</p>');
    fixture.detectChanges();
    await stable();

    const editor = fixture.componentInstance.editor();
    expect(editor?.isDestroyed).toBe(false);

    fixture.destroy();

    expect(editor?.isDestroyed).toBe(true);
  });
});
