import { Component, computed, input, output } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';

export type HubConflictChoiceValue = 'hub' | 'mine' | 'both';

/** What the dialog needs to show; the Hub web sync supplies it (structural, so this primitive names no sync service). */
export interface HubConflictView {
  readonly entityType: string;
  readonly name: string | null;
  readonly fields: readonly string[];
  readonly mine: unknown;
  readonly theirs: unknown;
  readonly canKeepBoth: boolean;
}

interface FieldRow { readonly field: string; readonly mine: string; readonly theirs: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MAX_VALUE_CHARS = 200;

function show(value: unknown): string {
  if (value === undefined) return '(not set)';
  let text: string;
  try {
    text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/**
 * Inline conflict prompt of the Hub web (PD-052): the Hub changed this item while it was being edited here, and the two
 * versions cannot be merged. Nothing is parked, so the owner chooses at once: keep the Hub's version, keep the one made
 * here, or (for items that can fork) keep both, saving this version as a copy.
 */
@Component({
  selector: 'app-hub-conflict-dialog',
  imports: [CdkTrapFocus],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-bg/70">
      <section cdkTrapFocus cdkTrapFocusAutoCapture role="alertdialog" aria-modal="true" aria-labelledby="hub-conflict-title" aria-describedby="hub-conflict-body"
        class="w-136 max-w-[90vw] rounded-sm border border-border bg-panel p-4 text-text shadow-lg">
        <h2 id="hub-conflict-title" class="text-sm font-semibold">This item changed on the Hub</h2>
        <p id="hub-conflict-body" class="mt-1 text-ui-sm text-text-muted">
          @if (request().name) { <span class="font-semibold text-text">{{ request().name }}</span> ({{ request().entityType }}) } @else { This {{ request().entityType }} }
          was changed somewhere else while you edited it, and the two versions cannot be combined automatically. Choose which to keep.
        </p>
        @if (rows().length > 0) {
          <table class="mt-3 w-full table-fixed border-collapse text-ui-sm" data-testid="conflict-fields">
            <thead>
              <tr class="text-left text-text-muted"><th class="w-1/4 pb-1 font-normal">Field</th><th class="w-3/8 pb-1 font-normal">Hub</th><th class="w-3/8 pb-1 font-normal">Yours</th></tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.field) {
                <tr class="border-t border-border align-top">
                  <td class="py-1 pr-2 font-mono">{{ row.field }}</td>
                  <td class="break-words py-1 pr-2 font-mono">{{ row.theirs }}</td>
                  <td class="break-words py-1 font-mono">{{ row.mine }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
        <div class="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <button type="button" data-testid="keep-hub" class="rounded-sm border border-border px-3 py-1 text-ui-sm hover:bg-panel-elevated" (click)="chosen.emit('hub')">Keep Hub</button>
          <button type="button" data-testid="keep-mine" class="rounded-sm border border-border px-3 py-1 text-ui-sm hover:bg-panel-elevated" (click)="chosen.emit('mine')">Keep mine</button>
          @if (request().canKeepBoth) {
            <button type="button" data-testid="keep-both" class="rounded-sm border border-accent px-3 py-1 text-ui-sm text-accent hover:bg-panel-elevated" (click)="chosen.emit('both')">Keep both</button>
          }
        </div>
      </section>
    </div>
  `,
})
export class HubConflictDialog {
  readonly request = input.required<HubConflictView>();
  readonly chosen = output<HubConflictChoiceValue>();

  protected readonly rows = computed<readonly FieldRow[]>(() => {
    const { fields, mine, theirs } = this.request();
    if (isRecord(mine) && isRecord(theirs) && !(fields.length === 1 && fields[0] === '*')) {
      return fields.map((field) => ({ field, mine: show(mine[field]), theirs: show(theirs[field]) }));
    }
    return [{ field: 'value', mine: show(mine ?? '(deleted)'), theirs: show(theirs ?? '(deleted)') }];
  });
}
