import { spawn } from 'node:child_process';
import type { SysApplyContext, SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { safeVendorCommand } from '../installed-software';
import type { RegisterSysOp } from './process';

type Hive = 'HKLM' | 'HKCU';
type View = '64' | '32' | 'default';
interface UninstallRef { hive: Hive; view: View; keyName: string; displayName: string; uninstallString: string }
interface State { displayName: string | null; uninstallString: string | null }
const ROOT = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\';
const CHANGED = 'The registered uninstaller changed since the preview.';

function strict(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid software.uninstall parameters.');
  const record = raw as Record<string, unknown>;
  const allowed = ['hive', 'view', 'keyName', 'displayName', 'uninstallString'];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`Invalid software.uninstall: unknown field ${key}.`);
  return record;
}
function validate(raw: unknown): UninstallRef {
  const r = strict(raw);
  if (r['hive'] !== 'HKLM' && r['hive'] !== 'HKCU') throw new Error('Invalid software.uninstall: hive.');
  if (r['view'] !== '64' && r['view'] !== '32' && r['view'] !== 'default') throw new Error('Invalid software.uninstall: view.');
  if (typeof r['keyName'] !== 'string' || !r['keyName'] || r['keyName'] === '.' || r['keyName'] === '..' || r['keyName'].length > 512 || /[\\/\u0000-\u001f\u007f]/.test(r['keyName'])) throw new Error('Invalid software.uninstall: keyName.');
  if (typeof r['displayName'] !== 'string' || !r['displayName'].trim() || r['displayName'].length > 512 || /[\u0000-\u001f\u007f]/.test(r['displayName'])) throw new Error('Invalid software.uninstall: displayName.');
  if (typeof r['uninstallString'] !== 'string' || !r['uninstallString'].trim() || r['uninstallString'].length > 8192) throw new Error('Invalid software.uninstall: uninstallString.');
  if (!safeVendorCommand(r['uninstallString'])) throw new Error('This uninstall command is not a supported direct vendor executable.');
  return { hive: r['hive'], view: r['view'], keyName: r['keyName'], displayName: r['displayName'], uninstallString: r['uninstallString'] };
}
function parseCommand(raw: string): { executable: string; args: string[] } {
  const match = raw.trim().match(/^(?:"([^"\r\n]+\.exe)"|([^\s"']+\.exe))(?:\s+(.*))?$/i);
  if (!match) throw new Error('The registered uninstall command could not be parsed safely.');
  let executable = match[1] ?? match[2] ?? '';
  let argText = match[3] ?? '';
  if (/^msiexec(?:\.exe)?$/i.test(executable)) {
    const productCode = argText.match(/\{[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\}/i)?.[0];
    if (!productCode) throw new Error('The MSI uninstall command has no valid product code.');
    executable = 'msiexec.exe';
    return { executable, args: ['/x', productCode.toUpperCase()] };
  }
  // Preserve simple quoted arguments, but reject nested quoting and shell syntax at validation.
  const args = argText.match(/"[^"]*"|[^\s]+/g)?.map((part) => part.startsWith('"') ? part.slice(1, -1) : part) ?? [];
  return { executable, args };
}
async function readState(p: UninstallRef, ctx: SysOpContext): Promise<{ state?: State; error?: string }> {
  const result = await ctx.helper('reg.getValues', { hive: p.hive, path: `${ROOT}${p.keyName}`, view: p.view });
  if (!result.ok) return { error: result.error };
  const values = (result.data as { values?: unknown } | null)?.values;
  if (!Array.isArray(values)) return { error: 'The uninstall registry values could not be read.' };
  const find = (name: string): string | null => {
    const item = values.find((v) => v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' && (v as { name: string }).name.toLowerCase() === name.toLowerCase()) as { data?: unknown } | undefined;
    return typeof item?.data === 'string' ? item.data : null;
  };
  return { state: { displayName: find('DisplayName'), uninstallString: find('UninstallString') } };
}
function launch(command: string): Promise<void> {
  const { executable, args } = parseCommand(command);
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(executable, args, { shell: false, windowsHide: false, stdio: 'ignore' }); }
    catch (error) { reject(error); return; }
    child.once('error', reject);
    child.once('spawn', () => resolve());
  });
}

export const softwareUninstallOp: SysOpDefinition<UninstallRef> = {
  kind: 'software.uninstall',
  validate,
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const read = await readState(p, ctx);
    const target = p.displayName;
    if (!read.state) return { target, summary: 'Launch registered interactive uninstaller', requiresElevation: false, noUndo: true, precondition: null, blockedReason: `Cannot verify the registered uninstaller: ${read.error}` };
    const precondition = read.state;
    if (precondition.displayName !== p.displayName || precondition.uninstallString !== p.uninstallString) {
      return { target, summary: 'Launch registered interactive uninstaller', requiresElevation: false, noUndo: true, precondition, blockedReason: 'The selected software entry no longer matches its registered uninstaller.' };
    }
    return { target, summary: 'Launch registered interactive uninstaller', before: 'Installed', after: 'Uninstaller launched', warnings: ['This launches the vendor uninstaller. Removal is interactive and cannot be undone.'], requiresElevation: false, noUndo: true, precondition };
  },
  async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
    const current = await readState(p, ctx);
    if (!current.state) return { outcome: 'failed', message: `Cannot re-check the registered uninstaller: ${current.error}` };
    const before = precondition as State;
    if (current.state.displayName !== before?.displayName || current.state.uninstallString !== before?.uninstallString || current.state.displayName !== p.displayName || current.state.uninstallString !== p.uninstallString) {
      return { outcome: 'conflict', message: CHANGED };
    }
    try { await launch(p.uninstallString); }
    catch (error) { return { outcome: 'failed', message: error instanceof Error ? error.message : String(error) }; }
    return { outcome: 'applied', before: 'Installed', after: 'Uninstaller launched' };
  },
};

export function registerSoftwareOps(register: RegisterSysOp): void { register(softwareUninstallOp); }
