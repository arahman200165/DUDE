import { TestBed } from '@angular/core/testing';
import { ToolDefinition } from '../../models/tool-definition.model';
import { ToolCapability } from '../../models/tool-capability.model';
import { PlatformService } from '../../../core/platform/platform.service';
import { DesktopCapabilityBadge } from './desktop-capability-badge';

describe('DesktopCapabilityBadge', () => {
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

  const fs = (note: string): ToolCapability => ({ kind: 'platform', id: 'native-fs', web: 'fallback', note });

  function withPlatform(isDesktop: boolean) {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => isDesktop } }] });
    return TestBed.createComponent(DesktopCapabilityBadge);
  }

  it('renders nothing when no definition is set', () => {
    const fixture = withPlatform(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('renders nothing when the tool declares no platform capabilities', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', base);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('renders nothing when the tool declares only runtimes', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', { ...base, capabilities: [{ kind: 'runtime', runtime: 'sqljs' }] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('shows an upsell tone on web when capabilities are declared', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', { ...base, capabilities: [fs('native filesystem access')] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('More capable on desktop');
    expect(fixture.nativeElement.querySelector('span')?.getAttribute('title')).toBe('Better on desktop: native filesystem access');
  });

  it('shows a quiet confirmation on desktop when capabilities are declared', () => {
    const fixture = withPlatform(true);
    fixture.componentRef.setInput('definition', { ...base, capabilities: [fs('native filesystem access'), { kind: 'platform', id: 'file-watch', web: 'unavailable', note: 'file watching' }, { kind: 'runtime', runtime: 'pyodide' }] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Desktop-enhanced');
    expect(fixture.nativeElement.querySelector('span')?.getAttribute('title')).toBe(
      'Better on desktop: native filesystem access · Desktop only: file watching',
    );
  });

  it('warns on web when some feature is unavailable there, not just weaker', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', { ...base, capabilities: [{ kind: 'platform', id: 'llm-proxy', web: 'unavailable', note: 'AI explain' }] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Some features need desktop');
  });

  it('shows a warning glyph (aria-hidden) with the text when a feature is unavailable on web', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', { ...base, capabilities: [{ kind: 'platform', id: 'llm-proxy', web: 'unavailable', note: 'AI explain' }] });
    fixture.detectChanges();

    const glyph = fixture.nativeElement.querySelector('app-status-glyph');
    expect(glyph.getAttribute('data-glyph')).toBe('warning');
    expect(glyph.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Some features need desktop');
  });
});
