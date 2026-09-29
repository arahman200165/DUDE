import { REGISTRY_HIVES, SYS_READ_METHODS, type SysReadMethod } from '../src/shared-logic/system/system-types';

const VIEWS: readonly string[] = ['default', '64', '32'];
const REGISTRY_METHODS: readonly SysReadMethod[] = ['reg.enumKey', 'reg.getValues'];
const PROCESS_REF_METHODS: readonly SysReadMethod[] = ['process.detail', 'process.modules', 'process.handles'];
const FILE_PATH_METHODS: readonly SysReadMethod[] = ['file.version', 'file.signature'];
const MAX_PID = 4294967295;
const MAX_FILE_PATH = 32767;
const MAX_PATH = 1024;
const MAX_SEGMENT = 255;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function validateRegistryPath(path: unknown): string {
  if (typeof path !== 'string') throw new Error('Registry path must be a string.');
  if (path.length > MAX_PATH) throw new Error('Registry path is too long.');
  if (/[\u0000-\u001f]/.test(path)) throw new Error('Registry path contains control characters.');
  if (path === '') return path;
  if (path.startsWith('\\') || path.endsWith('\\')) throw new Error('Registry path must not start or end with a backslash.');
  for (const segment of path.split('\\')) {
    if (segment === '') throw new Error('Registry path has an empty segment.');
    if (segment.length > MAX_SEGMENT) throw new Error('Registry key name is too long.');
  }
  return path;
}

function validatePid(pid: unknown): number {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid < 0 || pid > MAX_PID) throw new Error('Process id must be an integer from 0 to 4294967295.');
  return pid;
}

function exactKeys(params: Record<string, unknown>, expected: readonly string[], message: string): void {
  const keys = Object.keys(params).sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) throw new Error(message);
}

function validateFilePath(path: unknown): string {
  if (typeof path !== 'string') throw new Error('File path must be a string.');
  if (path.length < 1 || path.length > MAX_FILE_PATH) throw new Error('File path must be 1 to 32767 characters.');
  if (/[\u0000-\u001f\u007f]/.test(path)) throw new Error('File path contains control characters.');
  if (!/^(?:[A-Za-z]:[\\/]|\\\\[^\\])/.test(path)) throw new Error('File path must be an absolute Windows path.');
  return path;
}

/** Validates a renderer-supplied system call; throws a short `Error` on anything invalid. */
export function validateSysCall(method: unknown, params: unknown): { method: SysReadMethod; params: object } {
  if (typeof method !== 'string' || !(SYS_READ_METHODS as readonly string[]).includes(method)) throw new Error('Unknown system method.');
  const name = method as SysReadMethod;
  if (PROCESS_REF_METHODS.includes(name)) {
    if (!isPlainObject(params)) throw new Error('Process parameters must be an object.');
    exactKeys(params, ['pid', 'startKey'], 'Process parameters must be exactly pid and startKey.');
    const startKey = params['startKey'];
    if (typeof startKey !== 'string' || !/^[0-9]{1,20}$/.test(startKey)) throw new Error('Process start key must be a decimal string.');
    return { method: name, params: { pid: validatePid(params['pid']), startKey } };
  }
  if (name === 'process.threads') {
    if (!isPlainObject(params)) throw new Error('Process parameters must be an object.');
    exactKeys(params, ['pid'], 'Process parameters must be exactly pid.');
    return { method: name, params: { pid: validatePid(params['pid']) } };
  }
  if (FILE_PATH_METHODS.includes(name)) {
    if (!isPlainObject(params)) throw new Error('File parameters must be an object.');
    exactKeys(params, ['path'], 'File parameters must be exactly path.');
    return { method: name, params: { path: validateFilePath(params['path']) } };
  }
  if (!REGISTRY_METHODS.includes(name)) {
    if (params === undefined || params === null) return { method: name, params: {} };
    if (!isPlainObject(params) || Object.keys(params).length > 0) throw new Error('This method takes no parameters.');
    return { method: name, params: {} };
  }
  if (!isPlainObject(params)) throw new Error('Registry parameters must be an object.');
  const keys = Object.keys(params).sort();
  if (keys.length !== 3 || keys[0] !== 'hive' || keys[1] !== 'path' || keys[2] !== 'view') throw new Error('Registry parameters must be exactly hive, path and view.');
  if (typeof params['hive'] !== 'string' || !(REGISTRY_HIVES as readonly string[]).includes(params['hive'])) throw new Error('Unknown registry hive.');
  if (typeof params['view'] !== 'string' || !VIEWS.includes(params['view'])) throw new Error('Unknown registry view.');
  return { method: name, params: { hive: params['hive'], path: validateRegistryPath(params['path']), view: params['view'] } };
}
