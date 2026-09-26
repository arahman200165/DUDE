const mock = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('electron', () => ({ ipcMain: { on: (channel: string, handler: (...args: unknown[]) => void) => mock.handlers.set(channel, handler) } }));

import { enqueueDeepLinkArguments, extractDeepLinkArgument, registerDeepLinkHandlers } from './deep-link-bridge';

describe('deep-link transport', () => {
  it('accepts only short dude:// arguments', () => {
    expect(extractDeepLinkArgument(['--other', 'dude://open/tool/json'])).toBe('dude://open/tool/json');
    expect(extractDeepLinkArgument(['https://example.test/path'])).toBeNull();
    expect(extractDeepLinkArgument([`dude://${'x'.repeat(2048)}`])).toBeNull();
  });

  it('queues cold-start links until this window renderer signals readiness', () => {
    const send = vi.fn();
    const webContents = { send, on: vi.fn() };
    const window = { webContents, on: vi.fn(), isDestroyed: () => false };
    enqueueDeepLinkArguments(['dude://open/tool/json']);
    registerDeepLinkHandlers(window as never);
    expect(send).not.toHaveBeenCalled();

    const ready = mock.handlers.get('dude:deepLink:ready')!;
    ready({ sender: {} });
    expect(send).not.toHaveBeenCalled();
    ready({ sender: webContents });
    expect(send).toHaveBeenCalledWith('dude:deepLink:item', 'dude://open/tool/json');
  });
});
