import { randomBytes } from 'node:crypto';
import type { DeviceCapabilities } from '@dude/persistence';
import type { StoreHealth } from '@dude/contracts';
import { openDeviceStore } from './store/open-store.js';
import type { AppInfo } from './store/identity.js';
import { createRpcServer } from './rpc/server.js';
import type { RpcServer } from './rpc/server.js';

/** First message from main: the config plus the private port every later request travels on. */
interface AgentConfig {
  dir: string;
  machineGuid: string | null;
  appInfo: AppInfo;
  capabilities: DeviceCapabilities;
}

/** Posted on the port before any request is served. */
export type AgentReadyEvent =
  | { type: 'ready'; status: 'ready'; health: StoreHealth }
  | { type: 'ready'; status: 'incompatible' | 'corrupt'; message: string };

const parentPort = process.parentPort;

parentPort?.once('message', (event) => {
  const { config } = event.data as { config: AgentConfig };
  const port = event.ports[0];
  const now = (): Date => new Date();
  const bytes = (n: number): Uint8Array => new Uint8Array(randomBytes(n));

  let server: RpcServer;
  const opened = openDeviceStore({ ...config, now, randomBytes: bytes });
  if (opened.status === 'ready') {
    server = createRpcServer(opened.store, { now, randomBytes: bytes });
    port.postMessage({ type: 'ready', status: 'ready', health: opened.health } satisfies AgentReadyEvent);
  } else {
    server = createRpcServer(null, { now, randomBytes: bytes, unavailable: { status: opened.status, message: opened.message } });
    port.postMessage({ type: 'ready', status: opened.status, message: opened.message } satisfies AgentReadyEvent);
  }

  port.on('message', async (message) => {
    const response = await server.handle(message.data);
    port.postMessage(response);
    if (server.closed) setImmediate(() => process.exit(0));
  });
  port.start();
});
