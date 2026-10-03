import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HubConflictDialog, type HubConflictChoiceValue, type HubConflictView } from './hub-conflict-dialog';

function render(request: HubConflictView) {
  const fixture = TestBed.createComponent(HubConflictDialog);
  fixture.componentRef.setInput('request', request);
  const choices: HubConflictChoiceValue[] = [];
  fixture.componentInstance.chosen.subscribe((c) => choices.push(c));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { root, choices, click: (id: string) => (root.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click() };
}

const base: HubConflictView = { entityType: 'pipeline', name: 'Deploy', fields: ['name', 'description'], mine: { name: 'Mine', description: 'a' }, theirs: { name: 'Hub', description: 'b' }, canKeepBoth: true };

describe('HubConflictDialog', () => {
  it('names the item and lists each conflicting field with both versions', () => {
    const { root } = render(base);
    expect(root.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(root.textContent).toContain('Deploy');
    const rows = [...root.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()).join(' '));
    expect(rows).toEqual(['name Hub Mine', 'description b a']);
  });

  it('emits the choice of each button', () => {
    const { click, choices } = render(base);
    click('keep-hub');
    click('keep-mine');
    click('keep-both');
    expect(choices).toEqual(['hub', 'mine', 'both']);
  });

  it('hides Keep both when the item cannot fork', () => {
    const { root } = render({ ...base, canKeepBoth: false });
    expect(root.querySelector('[data-testid="keep-both"]')).toBeNull();
    expect(root.querySelector('[data-testid="keep-hub"]')).not.toBeNull();
  });

  it('shows a whole-value row for a delete-versus-edit conflict', () => {
    const { root } = render({ ...base, fields: ['*'], mine: { name: 'Edited' }, theirs: null, name: null });
    const row = root.querySelector('tbody tr')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(row).toContain('(deleted)');
    expect(row).toContain('Edited');
  });
});
