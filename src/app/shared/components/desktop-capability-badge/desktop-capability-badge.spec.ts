import { TestBed } from '@angular/core/testing';
import { ToolDefinition } from '../../models/tool-definition.model';
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

  function withPlatform(isDesktop: boolean) {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => isDesktop } }] });
    return TestBed.createComponent(DesktopCapabilityBadge);
  }

  it('renders nothing when no definition is set', () => {
    const fixture = withPlatform(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('renders nothing when the tool declares no desktopCapabilities', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', base);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('shows an upsell tone on web when capabilities are declared', () => {
    const fixture = withPlatform(false);
    fixture.componentRef.setInput('definition', { ...base, desktopCapabilities: ['native filesystem access'] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('More capable on desktop');
    expect(fixture.nativeElement.querySelector('span')?.getAttribute('title')).toBe('native filesystem access');
  });

  it('shows a quiet confirmation on desktop when capabilities are declared', () => {
    const fixture = withPlatform(true);
    fixture.componentRef.setInput('definition', { ...base, desktopCapabilities: ['native filesystem access', 'file watching'] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Desktop-enhanced');
    expect(fixture.nativeElement.querySelector('span')?.getAttribute('title')).toBe('native filesystem access · file watching');
  });
});
