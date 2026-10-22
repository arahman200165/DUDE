import { describe, expect, it } from 'vitest';
import { SerialGate } from './serial-gate';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('SerialGate', () => {
  it('never overlaps operations and keeps submission order', async () => {
    const gate = new SerialGate();
    const events: string[] = [];
    let active = 0; let maxActive = 0;
    const op = (name: string, delay: number) => gate.run(async () => {
      active++; maxActive = Math.max(maxActive, active); events.push(`start ${name}`);
      for (let i = 0; i < delay; i++) await tick();
      events.push(`end ${name}`); active--; return name;
    });
    const results = await Promise.all([op('a', 3), op('b', 0), op('c', 2)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(maxActive).toBe(1);
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('keeps serving later work after a failed operation', async () => {
    const gate = new SerialGate();
    await expect(gate.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(gate.run(async () => 'next')).resolves.toBe('next');
  });

  it('close waits for queued work and then refuses every later call', async () => {
    const gate = new SerialGate();
    const events: string[] = [];
    const pending = gate.run(async () => { await tick(); await tick(); events.push('query'); });
    const closed = gate.close(async () => { events.push('close'); });
    await expect(gate.run(async () => 'late')).rejects.toThrow('closed');
    await expect(gate.close(async () => undefined)).rejects.toThrow('closed');
    await Promise.all([pending, closed]);
    expect(events).toEqual(['query', 'close']);
  });
});
