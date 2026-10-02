import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WORKSPACE_COMMAND_SOURCE_PROVIDERS, WorkspaceCommandSource } from './workspace-command-source';
import { WorkspaceTemplateService } from './workspace-template.service';
import { WorkspaceLayoutService } from './workspace-layout.service';
import { BUILT_IN_TEMPLATES } from "@dude/domain/core/workspace/workspace-template.model";

describe('WorkspaceCommandSource', () => {
  let source: WorkspaceCommandSource;
  let workspaceLayout: WorkspaceLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [...WORKSPACE_COMMAND_SOURCE_PROVIDERS] });
    source = TestBed.inject(WorkspaceCommandSource);
    workspaceLayout = TestBed.inject(WorkspaceLayoutService);
  });

  it('exposes one apply command per template plus a save-current command', () => {
    const commands = source.commands();
    expect(commands.filter((c) => c.kind === 'workspace').length).toBe(BUILT_IN_TEMPLATES.length + 1);
    expect(commands.some((c) => c.title === `Apply Workspace: ${BUILT_IN_TEMPLATES[0].name}`)).toBe(true);
    expect(commands.some((c) => c.id === 'workspace:save-current')).toBe(true);
  });

  it('applies a template directly when the current layout is empty', async () => {
    const command = source.commands().find((c) => c.id === `workspace:apply:${BUILT_IN_TEMPLATES[0].id}`)!;
    const confirmSpy = vi.spyOn(window, 'confirm');

    await command.execute();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(workspaceLayout.openTabs()).toEqual(BUILT_IN_TEMPLATES[0].openTabs);
  });

  it('asks for confirmation before replacing a non-empty layout, and honors "cancel"', async () => {
    workspaceLayout.openTool('base64');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const command = source.commands().find((c) => c.id === `workspace:apply:${BUILT_IN_TEMPLATES[0].id}`)!;

    await command.execute();

    expect(workspaceLayout.openTabs()).toEqual(['base64']);
  });

  it('save-current prompts for a name and saves it as a new user template', async () => {
    const templateStore = TestBed.inject(WorkspaceTemplateService);
    vi.spyOn(window, 'prompt').mockReturnValue('My Command Template');
    const before = templateStore.templates().length;

    await source.commands().find((c) => c.id === 'workspace:save-current')!.execute();

    expect(templateStore.templates().length).toBe(before + 1);
    expect(templateStore.templates().some((t) => t.name === 'My Command Template')).toBe(true);
  });

  it('save-current does nothing when the prompt is cancelled', async () => {
    const templateStore = TestBed.inject(WorkspaceTemplateService);
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const before = templateStore.templates().length;

    await source.commands().find((c) => c.id === 'workspace:save-current')!.execute();

    expect(templateStore.templates().length).toBe(before);
  });
});
