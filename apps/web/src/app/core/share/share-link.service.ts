import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from '../platform/platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { recordImportedFileFlags, textFileInputOf } from '../text-file-input/imported-file-flags';
import { readStorageValue, writeStorageValue } from '../workspace/workspace-storage-bridge';
import { decodeShareFragment, encodeShareFragment, isShareFragment } from "@dude/tool-engine/core/share/share-link-codec";

/**
 * The public zero-install web companion. Desktop links point here rather than at the desktop app's
 * private 127.0.0.1 server, which nobody else could open.
 */
export const WEB_COMPANION_BASE_URL = 'https://arahman200165.github.io/DUDE/';

export type ShareInputResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too-large' | 'not-shareable' };

/**
 * Shareable Tool Routes (DUDE_PRD.md §21 Phase 26 Item 12).
 *
 * - `linkFor` builds a bare tool URL: stable, and never carries data.
 * - `linkWithInputFor` embeds the tool's primary text input (its `fileInput`, via
 *   `textFileInputOf`) in the `#fragment`. The fragment never reaches a server. This is only ever
 *   a separate, explicit action.
 * - `receive` is the inbound half, called by the tool-route guard before the component
 *   constructs. It writes the decoded text through the tool's own declared persistence policy
 *   (exactly like Smart File Drop), flags it as imported so code-running tools gate it the same
 *   way they gate an opened file. The route guard then redirects to the same URL without the
 *   fragment, so the payload doesn't linger in the address bar or History. It never runs
 *   anything, calls the network, or saves beyond the tool's own policy.
 */
@Injectable({ providedIn: 'root' })
export class ShareLinkService {
  private readonly registry = inject(ToolRegistryService);
  private readonly platform = inject(PlatformService);

  private readonly receivedSignal = signal<string | null>(null);
  /** Tool id whose input was just loaded from a link, for the "Loaded from link" notice. */
  readonly received = this.receivedSignal.asReadonly();

  linkFor(toolId: string): string | null {
    const definition = this.registry.getById(toolId);
    if (!definition) return null;
    const base = this.platform.isDesktop() ? WEB_COMPANION_BASE_URL : new URL('.', document.baseURI).href;
    return new URL(definition.route.replace(/^\//, ''), base).href;
  }

  /** True on the Hub-served web build, where `linkFor` is a private link to the Hub's own origin. */
  isHubWeb(): boolean {
    return this.platform.hostKind === 'hub-web';
  }

  /**
   * Hub-served web only: the same tool route on the public GitHub Pages companion, which opens for anyone (no Hub
   * sign-in, no Hub data). `null` on every other host, where `linkFor` is already the right link.
   */
  publicCompanionLinkFor(toolId: string): string | null {
    const definition = this.registry.getById(toolId);
    if (!definition || !this.isHubWeb()) return null;
    return new URL(definition.route.replace(/^\//, ''), WEB_COMPANION_BASE_URL).href;
  }

  canShareInput(toolId: string): boolean {
    const definition = this.registry.getById(toolId);
    return !!definition && textFileInputOf(definition) !== undefined;
  }

  async linkWithInputFor(toolId: string): Promise<ShareInputResult> {
    const definition = this.registry.getById(toolId);
    const input = definition && textFileInputOf(definition);
    const route = this.linkFor(toolId);
    if (!definition || !input || !route) return { ok: false, reason: 'not-shareable' };
    const text = readStorageValue<unknown>(toolId, input.key, input.policy ?? 'session');
    const encoded = await encodeShareFragment(typeof text === 'string' ? text : '');
    return encoded.ok ? { ok: true, url: `${route}#${encoded.fragment}` } : encoded;
  }

  /** Cheap synchronous pre-check, so ordinary navigations never touch the async decoder. */
  carriesInput(fragment: string | null | undefined): boolean {
    return isShareFragment(fragment);
  }

  /** Returns `true` when a share payload was applied. Always safe to call. Ignores foreign fragments. */
  async receive(toolId: string, fragment: string | null | undefined): Promise<boolean> {
    const definition = this.registry.getById(toolId);
    const input = definition && textFileInputOf(definition);
    if (!definition || !input) return false;
    const text = await decodeShareFragment(fragment);
    if (text === null) return false;
    writeStorageValue(toolId, input.key, input.policy ?? 'session', text);
    recordImportedFileFlags(`shared-link${input.extensions[0] ?? ''}`);
    this.receivedSignal.set(toolId);
    return true;
  }

  dismissReceived(): void {
    this.receivedSignal.set(null);
  }
}
