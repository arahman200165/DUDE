import { TestBed } from '@angular/core/testing';
import { KeyValueEditor } from './key-value-editor';

describe('KeyValueEditor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders the empty message when there are no pairs', () => {
    const fixture = TestBed.createComponent(KeyValueEditor);
    fixture.componentRef.setInput('pairs', []);
    fixture.componentRef.setInput('emptyMessage', 'Nothing here yet.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing here yet.');
  });

  it('emits an appended pair when Add is clicked', () => {
    const fixture = TestBed.createComponent(KeyValueEditor);
    fixture.componentRef.setInput('pairs', [{ key: 'a', value: '1' }]);
    fixture.detectChanges();

    let emitted: readonly { key: string; value: string }[] | undefined;
    fixture.componentInstance.pairsChange.subscribe((value) => (emitted = value));

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const addButton = buttons.find((button) => button.textContent?.trim() === 'Add pair')!;
    addButton.click();

    expect(emitted).toEqual([
      { key: 'a', value: '1' },
      { key: '', value: '' },
    ]);
  });

  it('emits a filtered array when Remove is clicked', () => {
    const fixture = TestBed.createComponent(KeyValueEditor);
    fixture.componentRef.setInput('pairs', [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    fixture.detectChanges();

    let emitted: readonly { key: string; value: string }[] | undefined;
    fixture.componentInstance.pairsChange.subscribe((value) => (emitted = value));

    const removeButtons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
      'button[type="button"]',
    );
    removeButtons[0].click();

    expect(emitted).toEqual([{ key: 'b', value: '2' }]);
  });

  it('emits an updated pair when the key or value input changes', () => {
    const fixture = TestBed.createComponent(KeyValueEditor);
    fixture.componentRef.setInput('pairs', [{ key: 'a', value: '1' }]);
    fixture.detectChanges();

    let emitted: readonly { key: string; value: string }[] | undefined;
    fixture.componentInstance.pairsChange.subscribe((value) => (emitted = value));

    const keyInput: HTMLInputElement = fixture.nativeElement.querySelector('input');
    keyInput.value = 'changed';
    keyInput.dispatchEvent(new Event('input'));

    expect(emitted).toEqual([{ key: 'changed', value: '1' }]);
  });

  it('sets the title attribute from keyHint when it returns a value, and omits it otherwise', () => {
    const fixture = TestBed.createComponent(KeyValueEditor);
    fixture.componentRef.setInput('pairs', [
      { key: 'known', value: '1' },
      { key: 'unknown', value: '2' },
    ]);
    fixture.componentRef.setInput('keyHint', (key: string) => (key === 'known' ? 'A known header' : undefined));
    fixture.detectChanges();

    const keyInputs: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll(
      'input[placeholder="key"]',
    );
    expect(keyInputs[0].title).toBe('A known header');
    expect(keyInputs[1].title).toBe('');
  });
});
