import { Component, computed, forwardRef, input, output, signal } from '@angular/core';
import { JsonTreeNode, JsonValueType } from "@dude/tool-engine/tools/json/json-tree";
import { JsonTreeEdit } from "@dude/tool-engine/tools/json/json-tree-edit";

export interface JsonTreeEditEvent {
  readonly segments: readonly (string | number)[];
  readonly edit: JsonTreeEdit;
}

const VALUE_TYPES: readonly JsonValueType[] = ['object', 'array', 'string', 'number', 'boolean', 'null'];

/**
 * Recursive editable tree for the JSON Formatter's "Tree" view. Deliberately
 * forked from the shared, domain-agnostic `TreeView` primitive rather than
 * extending it — baking JSON-specific edit semantics (rename key, change
 * type, add/delete) into that shared component would pollute it for future
 * non-JSON consumers.
 */
@Component({
  selector: 'app-json-tree-editor',
  imports: [forwardRef(() => JsonTreeEditor)],
  templateUrl: './json-tree-editor.html',
})
export class JsonTreeEditor {
  readonly node = input.required<JsonTreeNode>();
  readonly edit = output<JsonTreeEditEvent>();

  protected readonly valueTypes = VALUE_TYPES;
  protected readonly expanded = signal(true);

  protected readonly isRoot = computed(() => this.node().segments.length === 0);
  protected readonly isContainer = computed(() => this.node().type === 'object' || this.node().type === 'array');
  protected readonly booleanDisplay = computed(() => (this.node().value ? 'true' : 'false'));

  protected toggle(): void {
    this.expanded.set(!this.expanded());
  }

  protected onRenameKey(event: Event): void {
    const newKey = (event.target as HTMLInputElement).value;
    if (newKey === this.node().key) return;
    this.edit.emit({ segments: this.node().segments, edit: { kind: 'renameKey', newKey } });
  }

  protected onTypeChange(event: Event): void {
    const type = (event.target as HTMLSelectElement).value as JsonValueType;
    this.edit.emit({ segments: this.node().segments, edit: { kind: 'setType', type } });
  }

  protected onValueInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const node = this.node();
    const value = node.type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
    this.edit.emit({ segments: node.segments, edit: { kind: 'setValue', value } });
  }

  protected onBooleanChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value === 'true';
    this.edit.emit({ segments: this.node().segments, edit: { kind: 'setValue', value } });
  }

  protected deleteSelf(): void {
    this.edit.emit({ segments: this.node().segments, edit: { kind: 'delete' } });
  }

  protected addChild(): void {
    this.edit.emit({ segments: this.node().segments, edit: { kind: 'addChild', value: '' } });
  }

  protected onChildEdit(event: JsonTreeEditEvent): void {
    this.edit.emit(event);
  }
}
