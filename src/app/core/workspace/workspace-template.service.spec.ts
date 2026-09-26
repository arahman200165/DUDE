import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceTemplateService } from './workspace-template.service';
import { WorkspaceLayoutService } from './workspace-layout.service';
import { BUILT_IN_TEMPLATES } from './workspace-template.model';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('WorkspaceTemplateService', () => {
  let service: WorkspaceTemplateService;
  let workspaceLayout: WorkspaceLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkspaceTemplateService);
    workspaceLayout = TestBed.inject(WorkspaceLayoutService);
  });

  it('includes every built-in template by default', () => {
    expect(service.templates().map((t) => t.id)).toEqual(expect.arrayContaining(BUILT_IN_TEMPLATES.map((t) => t.id)));
  });

  it('applies a built-in template to the real workspace layout', () => {
    const template = BUILT_IN_TEMPLATES[0];
    service.apply(template);

    expect(workspaceLayout.openTabs()).toEqual(template.openTabs);
    expect(workspaceLayout.panelTree()).toEqual(template.panelTree);
  });

  it('saves the current layout as a new user template', () => {
    service.apply(BUILT_IN_TEMPLATES[0]);

    const saved = service.saveCurrentAsTemplate('My Copy');

    expect(saved.builtIn).toBe(false);
    expect(saved.openTabs).toEqual(BUILT_IN_TEMPLATES[0].openTabs);
    expect(service.templates().some((t) => t.id === saved.id)).toBe(true);
  });

  it('removes a user template but leaves built-ins untouched', () => {
    const saved = service.saveCurrentAsTemplate('Temporary');
    service.removeUserTemplate(saved.id);

    expect(service.templates().some((t) => t.id === saved.id)).toBe(false);
    expect(service.templates().length).toBe(BUILT_IN_TEMPLATES.length);
  });

  it('removeUserTemplate is a no-op for a built-in id', () => {
    service.removeUserTemplate(BUILT_IN_TEMPLATES[0].id);
    expect(service.templates().some((t) => t.id === BUILT_IN_TEMPLATES[0].id)).toBe(true);
  });

  it('survives a fresh service instance via persistence', async () => {
    const saved = service.saveCurrentAsTemplate('Persisted');
    await stable();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(WorkspaceTemplateService);

    expect(freshService.templates().some((t) => t.id === saved.id)).toBe(true);
  });
});
