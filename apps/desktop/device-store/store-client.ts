import type { AgentMethod, AgentMethodMap, AgentResponse, StoreHealth, StoreStatus } from '@dude/contracts';
import { DeviceStoreError } from './agent-host';
import type { CallOptions, DeviceStoreHost } from './agent-host';

/**
 * Module-level handle on the device store host, so main-side modules (bridge, crash detection,
 * later journals) never import the host construction. Production code reaches the store only
 * through the utility process; `createInProcessClient` exists for specs.
 */
let installed: DeviceStoreHost | null = null;

export function setDeviceStoreHost(host: DeviceStoreHost | null): void {
  installed = host;
}

/** The installed host, or null before startup / after teardown. */
export function getDeviceStoreHost(): DeviceStoreHost | null {
  return installed;
}

export function deviceStore(): DeviceStoreHost {
  if (!installed) throw new Error('The device store has not been started.');
  return installed;
}

export function isDeviceStoreReady(): boolean {
  return installed !== null && installed.status() === 'ready';
}

export function storeCall<M extends AgentMethod>(method: M, params: AgentMethodMap[M]['params'], options?: CallOptions): Promise<AgentMethodMap[M]['result']> {
  return deviceStore().call(method, params, options);
}

/** A host that routes calls to an in-process RPC server (`createRpcServer(...).handle`). Specs only. */
export function createInProcessClient(handle: (request: unknown) => Promise<AgentResponse>): DeviceStoreHost {
  let nextId = 1;
  let status: StoreStatus = 'ready';
  const listeners = new Set<(health: StoreHealth) => void>();
  return {
    async call(method, params) {
      if (status === 'unavailable') throw new DeviceStoreError('unavailable', 'The device store is unavailable.');
      const response = await handle({ id: nextId++, method, params });
      if (!response.ok) throw new DeviceStoreError(response.error.code, response.error.message);
      return response.result as never;
    },
    status: () => status,
    health: () => null,
    onHealth(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async retry() { /* the in-process client never stops by itself */ },
    async shutdown() { await handle({ id: nextId++, method: 'store.shutdown', params: {} }); status = 'unavailable'; },
    async detach() { await handle({ id: nextId++, method: 'store.checkpoint', params: {} }); status = 'unavailable'; },
    async stopAgent() { await handle({ id: nextId++, method: 'store.shutdown', params: {} }); status = 'unavailable'; },
    agentRunning: () => status !== 'unavailable',
    stoppedByUser: () => false,
  };
}
