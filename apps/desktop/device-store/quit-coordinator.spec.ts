vi.mock('electron', () => ({ ipcMain: { on: vi.fn(), removeListener: vi.fn(), handle: vi.fn() } }));

import { installQuitCoordinator } from './quit-coordinator';

function setup(over: Record<string, unknown> = {}) {
  const log: string[] = [];
  let listener: (event: { preventDefault(): void }) => void = () => undefined;
  const app = { on: (_e: string, l: typeof listener) => { listener = l; }, quit: vi.fn(() => { log.push('quit'); }) };
  const host = { shutdown: vi.fn(async () => { log.push('shutdown'); }), detach: vi.fn(async () => { log.push('detach'); }) };
  installQuitCoordinator({
    app,
    getWindow: () => ({}) as never,
    host: () => host as never,
    markCleanExit: async () => { log.push('mark'); },
    flush: async () => { log.push('flush'); },
    ...over,
  } as never);
  const fire = () => { const event = { prevented: false, preventDefault() { this.prevented = true; } }; listener(event); return event; };
  return { app, host, log, fire };
}

describe('quit coordinator', () => {
  afterEach(() => vi.useRealTimers());

  it('cancels the first before-quit and runs flush, clean-exit mark, shutdown, then quits again', async () => {
    const { fire, log } = setup();
    expect(fire().prevented).toBe(true);
    await vi.waitFor(() => expect(log).toContain('quit'));
    expect(log).toEqual(['flush', 'mark', 'shutdown', 'quit']);
  });

  it('detaches instead of shutting the agent down when it should keep running', async () => {
    const { fire, log, host } = setup({ keepAgentRunning: () => true });
    fire();
    await vi.waitFor(() => expect(log).toContain('quit'));
    expect(log).toEqual(['flush', 'mark', 'detach', 'quit']);
    expect(host.shutdown).not.toHaveBeenCalled();
  });

  it('shuts the agent down when the user opted out of background running', async () => {
    const { fire, log, host } = setup({ keepAgentRunning: () => false });
    fire();
    await vi.waitFor(() => expect(log).toContain('quit'));
    expect(log).toEqual(['flush', 'mark', 'shutdown', 'quit']);
    expect(host.detach).not.toHaveBeenCalled();
  });

  it('lets the second before-quit pass through, and ignores one that arrives mid-sequence', async () => {
    const { fire, app, log } = setup();
    fire();
    expect(fire().prevented).toBe(true);
    await vi.waitFor(() => expect(log).toContain('quit'));
    expect(fire().prevented).toBe(false);
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it('skips the flush when there is no window', async () => {
    const { fire, log } = setup({ getWindow: () => null });
    fire();
    await vi.waitFor(() => expect(log).toContain('quit'));
    expect(log).toEqual(['mark', 'shutdown', 'quit']);
  });

  it('quits anyway after 4 s when a step hangs', async () => {
    vi.useFakeTimers();
    const { fire, app } = setup({ flush: () => new Promise(() => undefined) });
    fire();
    await vi.advanceTimersByTimeAsync(3999);
    expect(app.quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it('quits even when a step throws', async () => {
    const { fire, app } = setup({ markCleanExit: async () => { throw new Error('boom'); } });
    fire();
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalled());
  });
});
