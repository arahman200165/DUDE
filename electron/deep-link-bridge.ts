import { ipcMain, type BrowserWindow } from 'electron';

const MAX_DEEP_LINK_LENGTH = 2048;
let receiver: BrowserWindow | null = null;
let rendererReady = false;
const queue: string[] = [];

/** Main validates only the transport envelope; renderer owns URL interpretation and routing. */
export function extractDeepLinkArgument(args: readonly string[]): string | null {
  return args.find((arg) =>
    typeof arg === 'string' && arg.length <= MAX_DEEP_LINK_LENGTH && /^dude:\/\//i.test(arg),
  ) ?? null;
}

export function enqueueDeepLinkArguments(args: readonly string[]): void {
  const url = extractDeepLinkArgument(args);
  if (!url) return;
  queue.push(url);
  flush();
}

function flush(): void {
  if (!receiver || receiver.isDestroyed() || !rendererReady) return;
  while (queue.length) receiver.webContents.send('dude:deepLink:item', queue.shift());
}

export function registerDeepLinkHandlers(window: BrowserWindow): void {
  receiver = window;
  ipcMain.on('dude:deepLink:ready', (event) => {
    if (event.sender !== window.webContents) return;
    rendererReady = true;
    flush();
  });
  window.webContents.on('did-start-loading', () => { rendererReady = false; });
  window.on('closed', () => { receiver = null; rendererReady = false; });
}
