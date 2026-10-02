import { TestBed } from '@angular/core/testing';
import { ToolDefinition } from '../../models/tool-definition.model';
import { SecurityBadge } from './security-badge';

describe('SecurityBadge', () => {
  const noop = () => Promise.resolve();
  const base: ToolDefinition = {
    id: 'a',
    title: 'A',
    description: '',
    category: 'data',
    keywords: [],
    route: '/tools/a',
    load: noop,
    io: { accepts: ['text'], produces: ['text'] },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders nothing when no definition is set', () => {
    const fixture = TestBed.createComponent(SecurityBadge);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('renders a "no persistence" label for persistence: none', () => {
    const fixture = TestBed.createComponent(SecurityBadge);
    fixture.componentRef.setInput('definition', { ...base, persistence: { input: 'none' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No persistence');
    expect(fixture.nativeElement.textContent).not.toContain('Network');
  });

  it('appends a network clause with the declared detail when network is required', () => {
    const fixture = TestBed.createComponent(SecurityBadge);
    fixture.componentRef.setInput('definition', {
      ...base,
      persistence: { input: 'none' },
      network: { required: true, detail: 'JWKS / OIDC discovery' },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Network: JWKS / OIDC discovery');
  });

  it('falls back to a generic "required" label when network.detail is absent', () => {
    const fixture = TestBed.createComponent(SecurityBadge);
    fixture.componentRef.setInput('definition', {
      ...base,
      persistence: { input: 'session' },
      network: { required: true },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Network: required');
  });
});
