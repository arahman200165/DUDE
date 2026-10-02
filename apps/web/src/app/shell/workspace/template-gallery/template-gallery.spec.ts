import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TemplateGallery } from './template-gallery';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { BUILT_IN_TEMPLATES } from "@dude/domain/core/workspace/workspace-template.model";

type Fixture = ReturnType<typeof TestBed.createComponent<TemplateGallery>>;

function expand(fixture: Fixture): void {
  const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('button');
  toggle.click();
  fixture.detectChanges();
}

function clickButtonContaining(fixture: Fixture, text: string): void {
  const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
    (b as HTMLButtonElement).textContent?.includes(text),
  ) as HTMLButtonElement;
  button.click();
  fixture.detectChanges();
}

describe('TemplateGallery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('shows built-in templates once expanded', () => {
    const fixture = TestBed.createComponent(TemplateGallery);
    fixture.detectChanges();
    expand(fixture);

    expect(fixture.nativeElement.textContent).toContain(BUILT_IN_TEMPLATES[0].name);
  });

  it('applies a template directly when the current layout is empty', () => {
    const fixture = TestBed.createComponent(TemplateGallery);
    fixture.detectChanges();
    expand(fixture);
    const confirmSpy = vi.spyOn(window, 'confirm');

    clickButtonContaining(fixture, 'Apply');

    expect(confirmSpy).not.toHaveBeenCalled();
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    expect(workspaceLayout.openTabs()).toEqual(BUILT_IN_TEMPLATES[0].openTabs);
  });

  it('asks for confirmation before replacing a non-empty layout, and honors "cancel"', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    workspaceLayout.openTool('base64');

    const fixture = TestBed.createComponent(TemplateGallery);
    fixture.detectChanges();
    expand(fixture);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    clickButtonContaining(fixture, 'Apply');

    expect(workspaceLayout.openTabs()).toEqual(['base64']);
  });

  it('applies after confirmation when the layout is non-empty', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    workspaceLayout.openTool('base64');

    const fixture = TestBed.createComponent(TemplateGallery);
    fixture.detectChanges();
    expand(fixture);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    clickButtonContaining(fixture, 'Apply');

    expect(workspaceLayout.openTabs()).toEqual(BUILT_IN_TEMPLATES[0].openTabs);
  });

  it('saves the current layout as a new named template and can remove it', () => {
    const fixture = TestBed.createComponent(TemplateGallery);
    fixture.detectChanges();
    expand(fixture);
    const templateStore = TestBed.inject(WorkspaceTemplateService);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'My Layout';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    clickButtonContaining(fixture, 'Save');

    const saved = templateStore.templates().find((t) => t.name === 'My Layout');
    expect(saved).toBeDefined();

    clickButtonContaining(fixture, 'Delete');
    expect(templateStore.templates().some((t) => t.id === saved!.id)).toBe(false);
  });

  it('does not save a blank name', () => {
    const fixture = TestBed.createComponent(TemplateGallery);
    fixture.detectChanges();
    expand(fixture);
    const templateStore = TestBed.inject(WorkspaceTemplateService);
    const before = templateStore.templates().length;

    clickButtonContaining(fixture, 'Save');

    expect(templateStore.templates().length).toBe(before);
  });
});
