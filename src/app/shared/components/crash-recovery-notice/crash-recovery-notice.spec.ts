import { TestBed } from '@angular/core/testing';
import { CrashRecoveryNotice } from './crash-recovery-notice';
import { CrashRecoveryService } from '../../../core/platform/crash-recovery.service';

describe('CrashRecoveryNotice', () => {
  it('renders nothing when not visible', () => {
    TestBed.configureTestingModule({ providers: [{ provide: CrashRecoveryService, useValue: { visible: () => false, dismiss: () => {} } }] });
    const fixture = TestBed.createComponent(CrashRecoveryNotice);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the notice and dismisses it on click', () => {
    const dismiss = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: CrashRecoveryService, useValue: { visible: () => true, dismiss } }] });
    const fixture = TestBed.createComponent(CrashRecoveryNotice);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("didn't shut down cleanly");
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(dismiss).toHaveBeenCalled();
  });
});
