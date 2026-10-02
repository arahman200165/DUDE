import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { SecretsService } from '../../../core/persistence/secrets.service';
import { AiProviderConfigService } from '../../../core/persistence/ai-provider-config.service';
import type { SecretStatusView } from "@dude/contracts/shared/models/platform-bridge.model";
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
interface ProviderFields {
  readonly baseUrl: string;
  readonly model: string;
}
const EMPTY_FIELDS: ProviderFields = { baseUrl: '', model: '' };
const API_KEY_PURPOSE = 'ai.llmApiKey';
const NO_KEY: SecretStatusView = { purpose: API_KEY_PURPOSE, isSet: false, hint: null, needsReentry: false };

const ERROR_TEXT: Readonly<Record<string, string>> = {
  'encryption-unavailable': 'Secure storage is unavailable on this system.',
  'store-unavailable': 'The device store is unavailable, so nothing could be saved.',
  'invalid-config': 'The base URL must be a valid http(s) address.',
};

/**
 * Settings › AI / LLM Provider (desktop-only). Base URL and model live in the main process
 * (`AiProviderConfigService`); the API key is a secret held in main (`SecretsService`, purpose
 * `ai.llmApiKey`). The key is never read back: this section shows only whether it is set and a masked
 * hint, and offers Replace / Remove.
 */
@Component({
  selector: 'app-ai-provider-settings',
  imports: [ErrorPanel],
  templateUrl: './ai-provider-settings.html',
})
export class AiProviderSettings {
  private readonly secrets = inject(SecretsService);
  private readonly config = inject(AiProviderConfigService);
  private readonly unsaved = inject(SettingsUnsavedChanges);

  protected readonly loading = signal(true);
  protected readonly baseUrl = signal('');
  protected readonly model = signal('');
  /** A new key being typed; empty means "leave the stored key alone". */
  protected readonly apiKey = signal('');
  protected readonly keyStatus = signal<SecretStatusView>(NO_KEY);
  protected readonly replacing = signal(false);
  protected readonly confirmingRemove = signal(false);
  protected readonly saveStatus = signal<SaveStatus>('idle');
  protected readonly saveError = signal('');
  private readonly saved = signal<ProviderFields>(EMPTY_FIELDS);

  /** The key input shows when nothing is stored, after Replace, or when the stored key needs re-entry. */
  protected readonly showKeyInput = computed(() => !this.keyStatus().isSet || this.keyStatus().needsReentry || this.replacing());

  readonly hasUnsavedChanges = computed(() => {
    const saved = this.saved();
    return !this.loading() && (this.baseUrl() !== saved.baseUrl || this.model() !== saved.model || this.apiKey() !== '');
  });

  constructor() {
    effect(() => this.unsaved.setDirty('ai', this.hasUnsavedChanges()));
    inject(DestroyRef).onDestroy(() => this.unsaved.setDirty('ai', false));
    void this.load();
  }

  private async load(): Promise<void> {
    const view = await this.config.get();
    this.applyFields({ baseUrl: view?.baseUrl ?? '', model: view?.model ?? '' });
    this.keyStatus.set(view?.apiKey ?? NO_KEY);
    this.loading.set(false);
  }

  private applyFields(fields: ProviderFields): void {
    this.baseUrl.set(fields.baseUrl);
    this.model.set(fields.model);
    this.saved.set(fields);
  }

  private async refreshKeyStatus(): Promise<void> {
    this.keyStatus.set(await this.secrets.status(API_KEY_PURPOSE));
  }

  protected onInput(field: 'baseUrl' | 'model' | 'apiKey', event: Event): void {
    this[field].set((event.target as HTMLInputElement).value);
    this.saveStatus.set('idle');
  }

  protected startReplace(): void {
    this.replacing.set(true);
    this.confirmingRemove.set(false);
  }

  protected cancelReplace(): void {
    this.replacing.set(false);
    this.apiKey.set('');
  }

  private fail(error: string): void {
    this.saveError.set(ERROR_TEXT[error] ?? error);
    this.saveStatus.set('error');
  }

  async save(): Promise<void> {
    this.saveStatus.set('saving');
    this.saveError.set('');
    const fields: ProviderFields = { baseUrl: this.baseUrl().trim(), model: this.model().trim() };
    const key = this.apiKey().trim();

    const configResult = await this.config.set(fields);
    if (!configResult.ok) return this.fail(configResult.error);
    if (key) {
      const keyResult = await this.secrets.set(API_KEY_PURPOSE, key);
      if (!keyResult.ok) return this.fail(keyResult.error);
    }

    this.applyFields(fields);
    this.apiKey.set('');
    this.replacing.set(false);
    await this.refreshKeyStatus();
    this.saveStatus.set('saved');
  }

  /** Removes only the stored API key; the template asks for an inline confirmation first. */
  protected async removeKey(): Promise<void> {
    this.confirmingRemove.set(false);
    const result = await this.secrets.remove(API_KEY_PURPOSE);
    if (!result.ok) return this.fail(result.error);
    this.apiKey.set('');
    this.replacing.set(false);
    await this.refreshKeyStatus();
    this.saveStatus.set('idle');
  }

  /** Doubles as this section's "Reset to defaults" — the default is "no provider configured". */
  async clear(): Promise<void> {
    await Promise.all([this.config.set({ baseUrl: '', model: '' }), this.secrets.remove(API_KEY_PURPOSE)]);
    this.applyFields(EMPTY_FIELDS);
    this.apiKey.set('');
    this.replacing.set(false);
    this.confirmingRemove.set(false);
    await this.refreshKeyStatus();
    this.saveStatus.set('idle');
    this.saveError.set('');
  }
}
