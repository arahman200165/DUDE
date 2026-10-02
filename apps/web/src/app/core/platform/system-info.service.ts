import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable } from '@angular/core';
import type { StartupProgramsResult } from "@dude/contracts/system/startup-types";
import type { InstalledSoftware } from "@dude/contracts/system/software-types";
import type { WindowsCapability, WindowsFeature } from "@dude/contracts/system/feature-types";
import type { DependencyNode } from "@dude/contracts/system/dependency-walker-types";
import type {
  EventChannelsResult, EventQueryFileParams, EventQueryParams, EventQueryResult, FileSignatureResult, FileVersionResult, HelperInfo, ProcessDetail, ProcessHandlesResult, ProcessListResult, ProcessModulesResult,
  ProbeDirsResult, ProcessRef, ProcessThreadsResult, ServiceListResult, ServiceConfigResult, RegistryEnumResult, RegistryExportParams, RegistryExportResult, RegistryKeyParams, RegistrySearchParams, RegistrySearchResult, RegistryValuesResult, SocketTableResult, SysMethodMap, SysReadMethod,
} from "@dude/contracts/system/system-types";

const UNAVAILABLE = 'Windows system tools are available in Desktop DUDE.';
const ACCESS_DENIED = 5;

/** A failed helper call. `code` is the Win32 error when the helper reported one (5 = access denied). */
export class SystemCallError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = 'SystemCallError';
  }

  get accessDenied(): boolean { return this.code === ACCESS_DENIED; }
}

/** Renderer entry point for read-only Windows system queries (native-system capability). Desktop only. */
@Injectable({ providedIn: 'root' })
export class SystemInfoService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  get available(): boolean { return !!this.platformBridgePort.get()?.sys; }

  async call<M extends SysReadMethod>(method: M, params: SysMethodMap[M]['params']): Promise<SysMethodMap[M]['result']> {
    const sys = this.platformBridgePort.get()?.sys;
    if (!sys) throw new Error(UNAVAILABLE);
    const result = await sys.call(method, params);
    if (!result.ok) throw new SystemCallError(result.error, result.code);
    return result.data;
  }

  startupList(): Promise<StartupProgramsResult> {
    const sys = this.platformBridgePort.get()?.sys;
    if (!sys) throw new Error(UNAVAILABLE);
    return sys.startupList();
  }
  listInstalledSoftware(): Promise<InstalledSoftware[]> {
    const sys = this.platformBridgePort.get()?.sys;
    if (!sys) throw new Error(UNAVAILABLE);
    return sys.listInstalledSoftware();
  }
  featureList(): Promise<readonly WindowsFeature[]> {
    const sys = this.platformBridgePort.get()?.sys;
    if (!sys) throw new Error(UNAVAILABLE);
    return sys.featureList();
  }
  featureCapabilities(): Promise<readonly WindowsCapability[]> {
    const sys = this.platformBridgePort.get()?.sys;
    if (!sys) throw new Error(UNAVAILABLE);
    return sys.featureCapabilities();
  }
  walkDependencies(path: string): Promise<DependencyNode> {
    const walker = this.platformBridgePort.get()?.dependencyWalker;
    if (!walker) throw new Error(UNAVAILABLE);
    return walker.walk(path);
  }
  helperInfo(): Promise<HelperInfo> { return this.call('helper.info', {}); }
  listProcesses(): Promise<ProcessListResult> { return this.call('process.list', {}); }
  processDetail(ref: ProcessRef): Promise<ProcessDetail> { return this.call('process.detail', ref); }
  processModules(ref: ProcessRef): Promise<ProcessModulesResult> { return this.call('process.modules', ref); }
  processThreads(pid: number): Promise<ProcessThreadsResult> { return this.call('process.threads', { pid }); }
  processHandles(ref: ProcessRef): Promise<ProcessHandlesResult> { return this.call('process.handles', ref); }
  lockOwners(path: string) { return this.call('lock.rmList', { path }); }
  lockHandles(path: string) { return this.call('lock.handleScan', { path }); }
  fileVersion(path: string): Promise<FileVersionResult> { return this.call('file.version', { path }); }
  fileSignature(path: string): Promise<FileSignatureResult> { return this.call('file.signature', { path }); }
  listServices(): Promise<ServiceListResult> { return this.call('svc.list', {}); }
  serviceConfig(name: string): Promise<ServiceConfigResult> { return this.call('svc.config', { name }); }
  eventChannels(): Promise<EventChannelsResult> { return this.call('evt.channels', {}); }
  queryEvents(params: EventQueryParams): Promise<EventQueryResult> { return this.call('evt.query', params); }
  queryEventFile(params: EventQueryFileParams): Promise<EventQueryResult> { return this.call('evt.queryFile', params); }
  tcpTable(): Promise<SocketTableResult> { return this.call('net.tcp', {}); }
  udpTable(): Promise<SocketTableResult> { return this.call('net.udp', {}); }
  enumRegistryKey(params: RegistryKeyParams): Promise<RegistryEnumResult> { return this.call('reg.enumKey', params); }
  registryValues(params: RegistryKeyParams): Promise<RegistryValuesResult> { return this.call('reg.getValues', params); }
  searchRegistry(params: RegistrySearchParams): Promise<RegistrySearchResult> { return this.call('reg.search', params); }
  exportRegistry(params: RegistryExportParams): Promise<RegistryExportResult> { return this.call('reg.export', params); }
  probeDirs(dirs: string[], extensions?: string[]): Promise<ProbeDirsResult> {
    return this.call('fs.probeDirs', extensions ? { dirs, extensions } : { dirs });
  }
}
