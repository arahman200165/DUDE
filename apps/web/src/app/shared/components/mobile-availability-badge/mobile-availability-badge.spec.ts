import { TestBed } from '@angular/core/testing';
import { MOBILE_TOOL_IDS_TOKEN, MobileAvailabilityBadge } from './mobile-availability-badge';

describe('MobileAvailabilityBadge', () => {
  function create(ids: readonly string[], toolId: string | undefined) {
    TestBed.configureTestingModule({ providers: [{ provide: MOBILE_TOOL_IDS_TOKEN, useValue: ids }] });
    const fixture = TestBed.createComponent(MobileAvailabilityBadge);
    fixture.componentRef.setInput('toolId', toolId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows "Also on Android" with an explanatory tooltip when the tool has an Android binding', () => {
    const el = create(['base64', 'uuid'], 'uuid');
    expect(el.textContent).toContain('Also on Android');
    expect(el.querySelector('span')?.getAttribute('title')).toBe('This tool also runs in the DUDE Android app');
    expect(el.querySelector('.sr-only')?.textContent).toContain('also runs in the DUDE Android app');
  });

  it('renders nothing when the tool has no Android binding', () => {
    expect(create(['base64'], 'uuid').textContent?.trim()).toBe('');
  });

  it('renders nothing when the id list is empty or no tool is set', () => {
    expect(create([], 'uuid').textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    expect(create(['uuid'], undefined).textContent?.trim()).toBe('');
  });
});
