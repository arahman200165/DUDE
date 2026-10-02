import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../../../core/platform/platform.service';
import { DesktopOnlyControl } from './desktop-only-control';

describe('DesktopOnlyControl', () => {
  function render(desktop: boolean) {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => desktop } }] });
    const fixture = TestBed.createComponent(DesktopOnlyControl);
    fixture.componentRef.setInput('capability', 'llm-proxy');
    fixture.componentRef.setInput('label', 'AI Explain');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a disabled, badged stand-in on the web that names the capability', () => {
    const button = render(false).querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('AI Explain');
    expect(button.textContent).toContain('Desktop');
    expect(button.title).toContain('Local LLM chat');
  });

  it('renders nothing on desktop, where the real control lives', () => {
    expect(render(true).querySelector('button')).toBeNull();
  });
});
