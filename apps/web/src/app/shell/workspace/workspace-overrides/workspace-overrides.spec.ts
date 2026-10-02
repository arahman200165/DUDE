import { TestBed } from '@angular/core/testing';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { WorkspaceOverrides } from './workspace-overrides';

describe('WorkspaceOverrides', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dude:v1:fake-tool:relayUrl', JSON.stringify('ws://global'));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ToolRegistryService,
          useValue: {
            getById: () => ({}),
            settingsSections: () => [
              {
                toolId: 'fake-tool',
                toolTitle: 'Fake Tool',
                title: 'Relay',
                load: async () => null,
                workspaceOverridable: [{ key: 'relayUrl', label: 'Relay URL', type: 'url' }],
              },
            ],
          },
        },
      ],
    });
  });

  it('renders one input per registry-declared override, with the global value as placeholder', () => {
    const fixture = TestBed.createComponent(WorkspaceOverrides);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[aria-label="Workspace settings"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(fixture.nativeElement.textContent).toContain('Fake Tool — Relay URL');
    expect(input.placeholder).toBe('Global: ws://global');

    input.value = 'ws://workspace';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const layout = TestBed.inject(WorkspaceLayoutService);
    expect(layout.preferenceOverrides()).toEqual({ 'fake-tool': { relayUrl: 'ws://workspace' } });

    (fixture.nativeElement.querySelector('button[title="Use the global setting"]') as HTMLButtonElement).click();
    expect(layout.preferenceOverrides()).toBeUndefined();
  });

  it('renders nothing when no tool declares a workspace-overridable preference', () => {
    TestBed.overrideProvider(ToolRegistryService, { useValue: { getById: () => ({}), settingsSections: () => [] } });
    const fixture = TestBed.createComponent(WorkspaceOverrides);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
