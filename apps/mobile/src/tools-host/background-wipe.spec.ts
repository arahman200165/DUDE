import { describe, expect, it } from 'vitest';
import { BACKGROUND_WIPE_MS, installBackgroundWipe, type AppStateSource } from './background-wipe';
import { ToolInputStore } from './tool-input-store';

function fixture() {
  let listener: (state: string) => void = () => undefined;
  let removed = false;
  let time = 1_000_000;
  const appState: AppStateSource = { addEventListener: (_type, next) => { listener = next; return { remove: () => { removed = true; } }; } };
  const store = new ToolInputStore();
  store.set('base64', { text: 'secret' });
  const dispose = installBackgroundWipe({ appState, store, now: () => time });
  return { store, send: (state: string) => listener(state), advance: (ms: number) => { time += ms; }, dispose, removed: () => removed };
}

describe('background wipe', () => {
  it('uses a five minute threshold', () => expect(BACKGROUND_WIPE_MS).toBe(300_000));
  it('keeps inputs after 4:59 in the background', () => {
    const f = fixture();
    f.send('background');
    f.advance(BACKGROUND_WIPE_MS - 1000);
    f.send('active');
    expect(f.store.get('base64')).toEqual({ text: 'secret' });
  });
  it('wipes at exactly 5:00', () => {
    const f = fixture();
    f.send('background');
    f.advance(BACKGROUND_WIPE_MS);
    f.send('active');
    expect(f.store.get('base64')).toEqual({});
  });
  it('measures from the first departure, so inactive then background does not restart the clock', () => {
    const f = fixture();
    f.send('inactive');
    f.advance(200_000);
    f.send('background');
    f.advance(100_000);
    f.send('active');
    expect(f.store.get('base64')).toEqual({});
  });
  it('resets after returning and ignores active without a departure', () => {
    const f = fixture();
    f.send('active');
    expect(f.store.get('base64')).toEqual({ text: 'secret' });
    f.send('background');
    f.advance(10_000);
    f.send('active');
    f.advance(BACKGROUND_WIPE_MS * 2);
    f.send('active');
    expect(f.store.get('base64')).toEqual({ text: 'secret' });
  });
  it('removes its listener', () => {
    const f = fixture();
    f.dispose();
    expect(f.removed()).toBe(true);
  });
});
