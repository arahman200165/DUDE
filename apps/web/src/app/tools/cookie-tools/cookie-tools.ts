import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { buildCookieHeader, parseCookieHeader } from "@dude/tool-engine/tools/cookie-tools/cookie-header";
import { EMPTY_SET_COOKIE, SameSite, SetCookieAttributes, buildSetCookieHeader, checkSetCookieWarnings, parseSetCookieHeader } from "@dude/tool-engine/tools/cookie-tools/set-cookie";

type Mode = 'cookie' | 'set-cookie';

const SAME_SITE_OPTIONS: readonly SameSite[] = ['', 'Strict', 'Lax', 'None'];

/**
 * Deliberately does NOT persist raw input — cookies routinely carry session
 * tokens, so this follows the same "no automatic persistence" pattern as
 * cURL Command Inspector/Converter and HTTP Response Viewer.
 */
@Component({
  selector: 'app-cookie-tools',
  imports: [ToolShell, CopyButton, KeyValueEditor],
  templateUrl: './cookie-tools.html',
})
export class CookieTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('cookie-tools', 'mode', 'local', 'cookie');
  protected readonly sameSiteOptions = SAME_SITE_OPTIONS;

  protected readonly cookieRaw = signal('session=abc123; theme=dark');
  protected readonly cookiePairs = computed(() => parseCookieHeader(this.cookieRaw()));

  protected readonly setCookieRaw = signal('session=abc123; Path=/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax');
  protected readonly setCookieAttributes = computed(() => parseSetCookieHeader(this.setCookieRaw()));
  protected readonly setCookieWarnings = computed(() => checkSetCookieWarnings(this.setCookieAttributes()));

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onCookieRawChange(event: Event): void {
    this.cookieRaw.set((event.target as HTMLInputElement).value);
  }

  protected onCookiePairsChange(pairs: readonly KeyValuePair[]): void {
    this.cookieRaw.set(buildCookieHeader(pairs));
  }

  protected onSetCookieRawChange(event: Event): void {
    this.setCookieRaw.set((event.target as HTMLInputElement).value);
  }

  protected onSetCookieFieldChange(field: keyof SetCookieAttributes, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    this.updateSetCookie({ [field]: value } as Partial<SetCookieAttributes>);
  }

  private updateSetCookie(patch: Partial<SetCookieAttributes>): void {
    const next: SetCookieAttributes = { ...EMPTY_SET_COOKIE, ...this.setCookieAttributes(), ...patch };
    this.setCookieRaw.set(buildSetCookieHeader(next));
  }
}
