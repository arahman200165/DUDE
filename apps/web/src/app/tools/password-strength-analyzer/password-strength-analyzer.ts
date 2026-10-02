import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { analyzePassword, StrengthVerdict } from "@dude/tool-engine/tools/password-strength-analyzer/password-strength-logic";

const VERDICT_LABELS: Record<StrengthVerdict, string> = {
  'very-weak': 'Very weak',
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};

const VERDICT_CLASSES: Record<StrengthVerdict, string> = {
  'very-weak': 'border-error/40 bg-error/10 text-error',
  weak: 'border-error/40 bg-error/10 text-error',
  fair: 'border-warning/40 bg-warning/10 text-warning',
  good: 'border-success/40 bg-success/10 text-success',
  strong: 'border-success/40 bg-success/10 text-success',
};

const VERDICT_BAR_WIDTH: Record<StrengthVerdict, string> = {
  'very-weak': '20%',
  weak: '40%',
  fair: '60%',
  good: '80%',
  strong: '100%',
};

/**
 * Deliberately does NOT persist the typed password, even under a `session`
 * policy — a password being analyzed is as sensitive as one being generated
 * or decoded elsewhere in Security (see `jwt.ts`'s and HMAC Generator's key
 * field for the same convention), so it lives in a bare in-memory signal.
 * Only the "show password" display toggle is a non-sensitive UI preference
 * and uses `PersistenceService` with `'local'`.
 */
@Component({
  selector: 'app-password-strength-analyzer',
  imports: [ToolShell, DecimalPipe],
  templateUrl: './password-strength-analyzer.html',
})
export class PasswordStrengthAnalyzer {
  private readonly persistence = inject(PersistenceService);

  protected readonly password = signal('');
  protected readonly showPassword = this.persistence.signal('password-strength-analyzer', 'showPassword', 'local', false);

  protected readonly analysis = computed(() => analyzePassword(this.password()));

  protected readonly verdictLabel = computed(() => VERDICT_LABELS[this.analysis().verdict]);
  protected readonly verdictClasses = computed(() => VERDICT_CLASSES[this.analysis().verdict]);
  protected readonly verdictBarWidth = computed(() => VERDICT_BAR_WIDTH[this.analysis().verdict]);

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected toggleShowPassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  protected clear(): void {
    this.password.set('');
  }
}
