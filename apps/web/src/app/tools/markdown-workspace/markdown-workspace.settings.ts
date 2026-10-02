import { Component, inject } from '@angular/core';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-relay";

/**
 * Markdown Workspace's contributed Settings section (Settings › Tools › Markdown Workspace, and the
 * setup wizard's Collaboration step via `settingsSection.onboarding`). Edits the *global* relay URL;
 * a per-workspace override is set from the Workspace's settings popover or the Host dialog.
 */
@Component({
  selector: 'app-markdown-workspace-settings',
  template: `
    <div class="flex flex-col gap-3">
      <p class="text-ui text-text-muted">
        "Host via Relay" uses this instead of your local network, for collaborating across networks. Point it at a relay you
        self-host (see <span class="font-mono">apps/collab-relay/</span> in the repo) — DUDE doesn't run one for you, and any relay is treated
        as untrusted infrastructure that only ever carries document sync data. A saved workspace can override it.
      </p>
      <label data-setting class="flex flex-col gap-1">
        <span class="text-ui text-text-muted">Relay URL</span>
        <input
          type="text"
          class="rounded-sm border border-border bg-panel px-2 py-1 font-mono text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="ws://relay.example.com:8080"
          [value]="relayUrl()"
          (input)="onInput($event)"
        />
      </label>
    </div>
  `,
})
export class MarkdownWorkspaceSettings {
  protected readonly relayUrl = inject(PersistenceService).signal(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, 'local', '');

  protected onInput(event: Event): void {
    this.relayUrl.set((event.target as HTMLInputElement).value);
  }
}
