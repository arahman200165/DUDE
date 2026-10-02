import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { SandboxedMarkdownPreview } from './sandboxed-markdown-preview';

describe('SandboxedMarkdownPreview', () => {
  const theme = signal('light');
  const revision = signal(0);

  beforeEach(() => {
    theme.set('light');
    revision.set(0);
    const root = document.documentElement;
    root.style.setProperty('--color-text', '#111111');
    root.style.setProperty('--color-text-muted', '#666666');
    root.style.setProperty('--color-panel-elevated', '#eeeeee');
    root.style.setProperty('--color-border', '#cccccc');
    root.style.setProperty('--color-accent', '#0055cc');
    TestBed.configureTestingModule({
      providers: [{ provide: AppearanceService, useValue: { effective: () => ({ theme: theme() }), revision } }],
    });
  });

  afterEach(() => {
    const root = document.documentElement;
    for (const name of ['--color-text', '--color-text-muted', '--color-panel-elevated', '--color-border', '--color-accent']) {
      root.style.removeProperty(name);
    }
  });

  function srcdoc(fixture: { nativeElement: HTMLElement }): string {
    return (fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement).getAttribute('srcdoc') ?? '';
  }

  it('injects the resolved light palette and keeps the iframe fully sandboxed', () => {
    const fixture = TestBed.createComponent(SandboxedMarkdownPreview);
    fixture.componentRef.setInput('html', '<p>hi</p>');
    fixture.detectChanges();

    const doc = srcdoc(fixture);
    expect(doc).toContain('color-scheme: light');
    expect(doc).toContain('--color-text: #111111');
    expect(doc).toContain('--color-accent: #0055cc');
    expect(doc).not.toContain('color-scheme: dark');
    expect(doc).not.toContain('#e5e5e5');
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('sandbox')).toBe('');
  });

  it('rebuilds the document when the appearance revision changes', () => {
    const fixture = TestBed.createComponent(SandboxedMarkdownPreview);
    fixture.componentRef.setInput('html', '<p>hi</p>');
    fixture.detectChanges();
    expect(srcdoc(fixture)).toContain('--color-text: #111111');

    theme.set('dark');
    document.documentElement.style.setProperty('--color-text', '#eeeeee');
    revision.update((n) => n + 1);
    fixture.detectChanges();

    expect(srcdoc(fixture)).toContain('color-scheme: dark');
    expect(srcdoc(fixture)).toContain('--color-text: #eeeeee');
  });
});
