import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateBranchName, type BranchType } from "@dude/tool-engine/tools/branch-name-generator/branch-name-generator-logic";

@Component({
  selector: 'app-branch-name-generator',
  imports: [ToolShell, CopyButton],
  templateUrl: './branch-name-generator.html',
})
export class BranchNameGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly type = this.persistence.signal<BranchType>('branch-name-generator', 'type', 'local', 'feature');
  protected readonly ticket = this.persistence.signal('branch-name-generator', 'ticket', 'session', '');
  protected readonly description = this.persistence.signal('branch-name-generator', 'description', 'session', '');
  protected readonly maxLength = this.persistence.signal('branch-name-generator', 'maxLength', 'local', 0);

  protected readonly branchName = computed(() =>
    generateBranchName({ type: this.type(), ticket: this.ticket(), description: this.description(), maxLength: this.maxLength() }),
  );

  protected onTypeChange(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as BranchType);
  }

  protected onTicketInput(event: Event): void {
    this.ticket.set((event.target as HTMLInputElement).value);
  }

  protected onDescriptionInput(event: Event): void {
    this.description.set((event.target as HTMLInputElement).value);
  }

  protected onMaxLengthInput(event: Event): void {
    this.maxLength.set(Number((event.target as HTMLInputElement).value));
  }
}
