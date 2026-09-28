import { TestBed } from '@angular/core/testing';
import { ValueDisclosure } from './value-disclosure';

describe('ValueDisclosure', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  function create(value: string) {
    const fixture = TestBed.createComponent(ValueDisclosure);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the value in the trigger and no popover by default', () => {
    const fixture = create('a very long truncated value');
    expect(fixture.nativeElement.textContent).toContain('a very long truncated value');
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('opens the popover on click and closes on a second click', () => {
    const fixture = create('full value');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).not.toBeNull();

    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('closes on Escape', () => {
    const fixture = create('full value');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('closes on an outside click', () => {
    const fixture = create('full value');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
  });
});
