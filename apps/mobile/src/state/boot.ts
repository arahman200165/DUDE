import { uuidv7 } from '@dude/persistence/ids/uuidv7';
import { TOOL_METADATA } from '@dude/tool-registry';
import Constants from 'expo-constants';
import { androidCertificatePin, androidHubTransport, androidRandomBytes, androidRealtime, androidSigner } from '../hub/native';
import { openMobileDatabase } from '../storage/expo-sql';
import { MobileStore } from '../storage/store';
import { DurableWorkbench } from './durable-backend';
import { MobileLifecycle } from '../lifecycle/mobile-lifecycle';

/** Failure preserves the private database and keys; the caller shows an error instead of creating a memory replica. */
export async function openProductionWorkbench(): Promise<DurableWorkbench> {
  const now = Date.now;
  const id = () => uuidv7(androidRandomBytes, now);
  const database = await openMobileDatabase();
  try {
    const store = await MobileStore.open(database, { deviceId: id(), id, now, tools: TOOL_METADATA });
    const identity = await store.installIdentity();
    const backend = new DurableWorkbench({ store, deviceId: identity.deviceId, installId: identity.installId, id, now,
      appVersion: Constants.expoConfig?.version ?? '0.0.0', ports: { signer: androidSigner, transport: androidHubTransport, certificatePin: androidCertificatePin }, realtime: androidRealtime });
    await backend.start();
    backend.installLifecycle(new MobileLifecycle(store, backend.ports, backend.enrollment, {
      stopSync: () => backend.quiesce(), unenroll: () => backend.unenroll(), changed: () => backend.changed(),
    }, { id, now }));
    await backend.refresh();
    return backend;
  } catch (error) { await database.close(); throw error; }
}
