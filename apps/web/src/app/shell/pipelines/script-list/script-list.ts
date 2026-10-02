import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserScriptStoreService } from '../../../core/pipeline/user-script-store.service';

@Component({
  selector: 'app-script-list',
  imports: [RouterLink],
  templateUrl: './script-list.html',
})
export class ScriptList {
  private readonly store = inject(UserScriptStoreService);

  protected readonly scripts = this.store.scripts;

  protected remove(id: string, name: string): void {
    if (confirm(`Delete script "${name}"? Any pipeline step referencing it will show as missing.`)) {
      this.store.remove(id);
    }
  }
}
