import { TestBed } from '@angular/core/testing';
import { PersistenceOptIn } from './persistence-opt-in';
import { PersistenceService } from '../../../core/persistence/persistence.service';

describe('PersistenceOptIn', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  function createComponent() {
    const fixture = TestBed.createComponent(PersistenceOptIn);
    fixture.componentRef.setInput('toolId', 'demoTool');
    fixture.componentRef.setInput('key', 'preference');
    fixture.detectChanges();
    return fixture;
  }

  it('is unchecked by default when no consent has been granted', () => {
    const fixture = createComponent();
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(checkbox.checked).toBe(false);
  });

  it('reflects pre-existing consent granted before the component was created', () => {
    const service = TestBed.inject(PersistenceService);
    service.setConsent('demoTool', 'preference', true);

    const fixture = createComponent();
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(checkbox.checked).toBe(true);
  });

  it('toggling the checkbox grants consent and re-renders checked', () => {
    const fixture = createComponent();
    const service = TestBed.inject(PersistenceService);
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(service.hasConsent('demoTool', 'preference')).toBe(true);
    expect(checkbox.checked).toBe(true);
  });
});
