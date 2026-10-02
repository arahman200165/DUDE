import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { octalToPermissions, Permissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions } from "@dude/tool-engine/tools/chmod-converter/chmod-convert";

type Scope = 'owner' | 'group' | 'other';
type Bit = 'read' | 'write' | 'execute';

const DEFAULT_PERMISSIONS: Permissions = {
  special: { setuid: false, setgid: false, sticky: false },
  owner: { read: true, write: true, execute: true },
  group: { read: true, write: false, execute: true },
  other: { read: true, write: false, execute: true },
};

@Component({
  selector: 'app-chmod-converter',
  imports: [ToolShell],
  templateUrl: './chmod-converter.html',
})
export class ChmodConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly permissions = this.persistence.signal<Permissions>('chmod-converter', 'permissions', 'session', DEFAULT_PERMISSIONS);

  protected readonly octalInput = signal(permissionsToOctal(this.permissions()));
  protected readonly symbolicInput = signal(permissionsToSymbolic(this.permissions()));
  protected readonly octalError = signal('');
  protected readonly symbolicError = signal('');

  protected readonly scopes: readonly Scope[] = ['owner', 'group', 'other'];
  protected readonly bits: readonly { readonly bit: Bit; readonly label: string }[] = [
    { bit: 'read', label: 'r' },
    { bit: 'write', label: 'w' },
    { bit: 'execute', label: 'x' },
  ];

  private applyPermissions(permissions: Permissions): void {
    this.permissions.set(permissions);
    this.octalInput.set(permissionsToOctal(permissions));
    this.symbolicInput.set(permissionsToSymbolic(permissions));
    this.octalError.set('');
    this.symbolicError.set('');
  }

  protected onOctalInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.octalInput.set(value);
    const result = octalToPermissions(value);
    if (!result.ok) {
      this.octalError.set(result.error);
      return;
    }
    this.permissions.set(result.permissions);
    this.symbolicInput.set(permissionsToSymbolic(result.permissions));
    this.octalError.set('');
    this.symbolicError.set('');
  }

  protected onSymbolicInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.symbolicInput.set(value);
    const result = symbolicToPermissions(value);
    if (!result.ok) {
      this.symbolicError.set(result.error);
      return;
    }
    this.permissions.set(result.permissions);
    this.octalInput.set(permissionsToOctal(result.permissions));
    this.symbolicError.set('');
    this.octalError.set('');
  }

  protected toggleBit(scope: Scope, bit: Bit): void {
    const current = this.permissions();
    this.applyPermissions({ ...current, [scope]: { ...current[scope], [bit]: !current[scope][bit] } });
  }

  protected toggleSpecial(kind: 'setuid' | 'setgid' | 'sticky'): void {
    const current = this.permissions();
    this.applyPermissions({ ...current, special: { ...current.special, [kind]: !current.special[kind] } });
  }

  protected isChecked(scope: Scope, bit: Bit): boolean {
    return this.permissions()[scope][bit];
  }
}
