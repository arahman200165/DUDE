import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RelatedToolsPanel } from './related-tools-panel';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('RelatedToolsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: {} }] });
  });

  it('renders nothing for a tool with no chainable candidates', () => {
    // An empty `produces` can never overlap any real tool's `accepts`, guaranteeing zero
    // candidates regardless of what else is in the real registry.
    const fixture = TestBed.createComponent(RelatedToolsPanel);
    fixture.componentRef.setInput('current', {
      id: 'zzz-isolated',
      title: 'Isolated',
      description: '',
      category: 'data',
      keywords: [],
      route: '/tools/zzz-isolated',
      load: () => Promise.resolve(),
      io: { accepts: ['text'], produces: [] },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('renders related tool links for a real, well-connected tool', async () => {
    const base64 = TOOL_DEFINITIONS.find((tool) => tool.id === 'base64')!;

    const fixture = TestBed.createComponent(RelatedToolsPanel);
    fixture.componentRef.setInput('current', base64);
    fixture.detectChanges();
    await stable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Related tools');
    expect(fixture.nativeElement.querySelectorAll('a').length).toBeGreaterThan(0);
  });
});
