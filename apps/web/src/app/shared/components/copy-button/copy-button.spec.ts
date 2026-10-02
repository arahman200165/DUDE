import { TestBed } from '@angular/core/testing';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the label by default', () => {
    const fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('text', 'hello');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('Copy');
  });

  it('is disabled when text is empty', () => {
    const fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('text', '');
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });

  it('copies the text and shows "Copied!" briefly on click', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('text', 'hello');
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    expect(fixture.nativeElement.textContent.trim()).toBe('Copied!');

    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('Copy');
  });
});
