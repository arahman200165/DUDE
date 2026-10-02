import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { SecureLocalService } from '../../../core/persistence/secure-local.service';
import { APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY, LLM_BASE_URL_KEY, LLM_MODEL_KEY } from "@dude/tool-engine/core/persistence/app-settings";
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
interface ProviderFields {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}
const EMPTY_FIELDS: ProviderFields = { baseUrl: '', model: '', apiKey: '' };

/**
 * Settings › AI / LLM Provider (desktop-only). Everything goes through `SecureLocalService`, not
 * `PersistenceService` — even the non-secret base URL/model — so the main process
 * (`apps/desktop/llm-bridge.ts`) reads the whole config through the one OS-keychain-backed store it
 * already has, under `APP_SETTINGS_NAMESPACE`.
 */
@Component({
  selector: 'app-ai-provider-settings',
  imports: [ErrorPanel],
  templateUrl: './ai-provider-settings.html',
})
export class AiProviderSettings {
  private readonly secureLocal = inject(SecureLocalService);
  private readonly unsaved = inject(SettingsUnsavedChanges);

  protected readonly loading = signal(true);
  protected readonly baseUrl = signal('');
  protected readonly model = signal('');
  protected readonly apiKey = signal('');
  protected readonly saveStatus = signal<SaveStatus>('idle');
  protected readonly saveError = signal('');
  private readonly saved = signal<ProviderFields>(EMPTY_FIELDS);

  readonly hasUnsavedChanges = computed(() => {
    const saved = this.saved();
    return !this.loading() && (this.baseUrl() !== saved.baseUrl || this.model() !== saved.model || this.apiKey() !== saved.apiKey);
  });

  constructor() {
    effect(() => this.unsaved.setDirty('ai', this.hasUnsavedChanges()));
    inject(DestroyRef).onDestroy(() => this.unsaved.setDirty('ai', false));
    void this.load();
  }

  private async load(): Promise<void> {
    const [baseUrl, model, apiKey] = await Promise.all([
      this.secureLocal.get(APP_SETTINGS_NAMESPACE, LLM_BASE_URL_KEY),
      this.secureLocal.get(APP_SETTINGS_NAMESPACE, LLM_MODEL_KEY),
      this.secureLocal.get(APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY),
    ]);
    const fields: ProviderFields = {
      baseUrl: (baseUrl.ok && baseUrl.value) || '',
      model: (model.ok && model.value) || '',
      apiKey: (apiKey.ok && apiKey.value) || '',
    };
    this.applyFields(fields);
    this.loading.set(false);
  }

  private applyFields(fields: ProviderFields): void {
    this.baseUrl.set(fields.baseUrl);
    this.model.set(fields.model);
    this.apiKey.set(fields.apiKey);
    this.saved.set(fields);
  }

  protected onInput(field: 'baseUrl' | 'model' | 'apiKey', event: Event): void {
    this[field].set((event.target as HTMLInputElement).value);
    this.saveStatus.set('idle');
  }

  async save(): Promise<void> {
    this.saveStatus.set('saving');
    this.saveError.set('');
    const fields: ProviderFields = { baseUrl: this.baseUrl().trim(), model: this.model().trim(), apiKey: this.apiKey().trim() };

    const results = await Promise.all([
      this.secureLocal.set(APP_SETTINGS_NAMESPACE, LLM_BASE_URL_KEY, fields.baseUrl),
      this.secureLocal.set(APP_SETTINGS_NAMESPACE, LLM_MODEL_KEY, fields.model),
      this.secureLocal.set(APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY, fields.apiKey),
    ]);

    const failure = results.find((r) => !r.ok);
    if (failure && !failure.ok) {
      this.saveError.set(failure.error === 'encryption-unavailable' ? 'Secure storage is unavailable on this system.' : failure.error);
      this.saveStatus.set('error');
      return;
    }

    this.applyFields(fields);
    this.saveStatus.set('saved');
  }

  /** Doubles as this section's "Reset to defaults" — the default is "no provider configured". */
  async clear(): Promise<void> {
    await Promise.all([
      this.secureLocal.remove(APP_SETTINGS_NAMESPACE, LLM_BASE_URL_KEY),
      this.secureLocal.remove(APP_SETTINGS_NAMESPACE, LLM_MODEL_KEY),
      this.secureLocal.remove(APP_SETTINGS_NAMESPACE, LLM_API_KEY_KEY),
    ]);
    this.applyFields(EMPTY_FIELDS);
    this.saveStatus.set('idle');
    this.saveError.set('');
  }
}
