import { ApplicationRef, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ToolRegistryService } from '../../core/registry/tool-registry.service';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { resolvePreference } from '../../core/workspace/workspace-preference';
import { MarkdownWorkspaceSettings } from './markdown-workspace.settings';
import { MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-relay";

describe('Markdown Workspace relay preference', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('contributes a desktop-only, onboarding-visible Settings section with an overridable relay URL', () => {
    const section = TestBed.inject(ToolRegistryService)
      .settingsSections()
      .find((candidate) => candidate.toolId === MARKDOWN_WORKSPACE_TOOL_ID);

    expect(section).toMatchObject({ title: 'Collaboration relay', desktopOnly: true, onboarding: true });
    expect(section?.workspaceOverridable).toEqual([{ key: RELAY_URL_KEY, label: 'Relay URL', type: 'url' }]);
  });

  it('the contributed section edits the global relay URL under the tool namespace', async () => {
    const fixture = TestBed.createComponent(MarkdownWorkspaceSettings);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'ws://global:9000';
    input.dispatchEvent(new Event('input'));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(localStorage.getItem('dude:v1:markdown-workspace:relayUrl')).toBe(JSON.stringify('ws://global:9000'));
  });

  it('a workspace override wins over the global relay URL', () => {
    const global = TestBed.inject(PersistenceService).signal(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, 'local', 'ws://global');
    const relay = runInInjectionContext(TestBed.inject(Injector), () => resolvePreference(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, global));

    TestBed.inject(WorkspaceLayoutService).setPreferenceOverride(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, 'ws://team');
    expect(relay()).toEqual({ value: 'ws://team', source: 'workspace' });
  });
});
