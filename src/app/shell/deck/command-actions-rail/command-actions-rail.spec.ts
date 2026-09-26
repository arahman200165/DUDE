import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CommandActionsRail } from './command-actions-rail';
import { PaletteCommand } from '../../../shared/models/command-source.model';

describe('CommandActionsRail', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders nothing when there are no commands', () => {
    const fixture = TestBed.createComponent(CommandActionsRail);
    fixture.componentRef.setInput('title', 'Clipboard Actions');
    fixture.componentRef.setInput('commands', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('runs a command\'s execute() on click', () => {
    const execute = vi.fn();
    const command: PaletteCommand = { id: 'native:quick-action:upper', kind: 'native', title: 'Copy as Uppercase', execute };
    const fixture = TestBed.createComponent(CommandActionsRail);
    fixture.componentRef.setInput('title', 'Clipboard Actions');
    fixture.componentRef.setInput('commands', [command]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Copy as Uppercase');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(execute).toHaveBeenCalled();
  });
});
