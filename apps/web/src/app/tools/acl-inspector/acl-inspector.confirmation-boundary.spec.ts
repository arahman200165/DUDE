import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AclGetResult } from "@dude/contracts/system/system-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { fakeSysPlanPreview, recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { AclInspectorTool } from './acl-inspector';

const OWNER = 'O:S-1-5-21-1-2-3-1001G:S-1-5-21-1-2-3-1001';
const SDDL = `${OWNER}D:AI(A;OICI;0x1200a9;;;BU)(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)`;
const acl = (overrides: Partial<AclGetResult> = {}): AclGetResult => ({
  target: { kind: 'file', path: 'C:\\work' }, isContainer: true, owner: 'S-1-5-21-1-2-3-1001', ownerName: 'PC\\me', group: 'S-1-5-21-1-2-3-1001', groupName: 'PC\\None',
  sddl: SDDL,
  dacl: [
    { sid: 'S-1-5-32-545', account: 'BUILTIN\\Users', type: 'allow', aceType: 0, flags: 0x03, mask: 0x1200a9, inherited: false, inheritedFrom: null },
    { sid: 'S-1-5-18', account: 'NT AUTHORITY\\SYSTEM', type: 'allow', aceType: 0, flags: 0x13, mask: 0x1f01ff, inherited: true, inheritedFrom: 'C:\\' },
    { sid: 'S-1-5-32-544', account: 'BUILTIN\\Administrators', type: 'allow', aceType: 0, flags: 0x13, mask: 0x1f01ff, inherited: true, inheritedFrom: 'C:\\' },
  ],
  daclNull: false, sacl: [], saclUnreadable: false, needsElevation: false, inheritanceProtected: false, effective: null, errors: [],
  ...overrides,
});

const preview = fakeSysPlanPreview({
  title: 'Change permissions', tool: 'acl-inspector',
  ops: [{ index: 0, kind: 'acl.set-dacl', target: 'C:\\work', summary: 'Change permissions', before: 'D:AI', after: 'D:AI', warnings: [], requiresElevation: false, noUndo: false }],
});

async function setup(options: { tokenError?: string; result?: AclGetResult } = {}) {
  const { bridge, calls } = recordingSysBridge({ preview, ...(options.tokenError ? { tokenError: options.tokenError } : {}) });
  const base = fakeElectronBridge();
  const sysCalls: string[] = [];
  installBridge(fakeElectronBridge({
    ...bridge,
    fs: { ...base.fs, pickDirectory: async () => ({ canceled: false, rootPath: 'C:\\work', rootName: 'work' }) },
    sys: {
      ...base.sys,
      call: async (method: string) => {
        sysCalls.push(method);
        if (method === 'acl.get') return { ok: true, data: options.result ?? acl() };
        if (method === 'sid.lookup') return { ok: true, data: { sid: 'S-1-5-32-545', accountName: 'Users', domain: 'BUILTIN', use: 'alias', dcLookupDisclosure: '' } };
        return { ok: false, error: 'unexpected' };
      },
    },
  } as never));
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AclInspectorTool);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const click = async (selector: string, index = 0) => { element.querySelectorAll<HTMLElement>(selector)[index].click(); await settleFsJobs(fixture); };
  const chooseFolder = async () => {
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Choose folder'))!.click();
    await settleFsJobs(fixture);
  };
  await chooseFolder();
  return { fixture, element, calls, sysCalls, click, chooseFolder };
}

const nothingMutated = (calls: ReturnType<typeof recordingSysBridge>['calls'], sysCalls: string[]) => {
  expect(calls.plans).toEqual([]);
  expect(calls.tokens).toEqual([]);
  expect(calls.applies).toEqual([]);
  expect(sysCalls.every((method) => !method.startsWith('acl.set'))).toBe(true);
};

describe('ACL Inspector: confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  it('loading, refreshing, effective access and the SDDL view never plan or apply', async () => {
    const { fixture, element, calls, sysCalls, chooseFolder } = await setup();
    expect(element.textContent).toContain('BUILTIN\\Users');
    nothingMutated(calls, sysCalls);
    await chooseFolder();
    const input = element.querySelector<HTMLInputElement>('input[aria-label="Account for effective access"]')!;
    input.value = 'BUILTIN\\Users'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Calculate DACL rights'))!.click();
    await settleFsJobs(fixture);
    element.querySelector<HTMLDetailsElement>('details')!.open = true;
    nothingMutated(calls, sysCalls);
  });

  it('inherited rows cannot be removed; an explicit row only previews until separately reviewed and confirmed', async () => {
    const { fixture, element, calls, sysCalls, click } = await setup();
    const buttons = element.querySelectorAll<HTMLButtonElement>('[data-testid="acl-remove-preview"]');
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].title).toContain('Inherited from the parent');
    expect(buttons[2].disabled).toBe(true);

    await click('[data-testid="acl-remove-preview"]', 0);
    expect(calls.plans).toHaveLength(1);
    const op = calls.plans[0].ops[0];
    expect(op.kind).toBe('acl.set-dacl');
    const params = op.params as { target: unknown; beforeSddl: string; afterSddl: string };
    expect(params.target).toEqual({ kind: 'file', path: 'C:\\work' });
    expect(params.beforeSddl).toBe(SDDL);
    expect(params.afterSddl).toBe(`${OWNER}D:AI(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)`);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    await click('[data-testid="system-change-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="system-change-confirm"]');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(sysCalls.filter((method) => method === 'acl.get').length).toBeGreaterThanOrEqual(2);
    void fixture;
  });

  it('Add entry and both inheritance actions only plan a DACL change and never apply', async () => {
    const { fixture, element, calls, sysCalls, click } = await setup();
    await click('[data-testid="acl-add-toggle"]');
    const principal = element.querySelector<HTMLInputElement>('[data-testid="acl-add-principal"]')!;
    principal.value = 'BUILTIN\\Users'; principal.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await click('[data-testid="acl-add-preview"]');
    expect(sysCalls).toContain('sid.lookup');
    expect(calls.plans).toHaveLength(1);
    const added = calls.plans[0].ops[0].params as { afterSddl: string };
    expect(added.afterSddl).toContain('(A;OICI;0x1200a9;;;BU)');
    expect(added.afterSddl.split('(A;OICI;0x1200a9;;;BU)').length).toBe(3);

    await click('[data-testid="acl-disable-inheritance"]');
    expect(calls.plans).toHaveLength(2);
    expect((calls.plans[1].ops[0].params as { afterSddl: string }).afterSddl).toMatch(/D:PAI/);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });

  it('enabling inheritance on a protected object plans only', async () => {
    const protectedSddl = `${OWNER}D:PAI(A;OICI;FA;;;SY)`;
    const { calls, sysCalls, click } = await setup({ result: acl({ inheritanceProtected: true, sddl: protectedSddl, dacl: [
      { sid: 'S-1-5-18', account: 'NT AUTHORITY\\SYSTEM', type: 'allow', aceType: 0, flags: 0x03, mask: 0x1f01ff, inherited: false, inheritedFrom: null },
    ] }) });
    await click('[data-testid="acl-enable-inheritance"]');
    expect(calls.plans).toHaveLength(1);
    expect((calls.plans[0].ops[0].params as { afterSddl: string }).afterSddl).not.toMatch(/D:P/);
    expect(calls.applies).toEqual([]);
    void sysCalls;
  });

  it('a rejected or missing confirmation token means apply is never called', async () => {
    const { calls, click } = await setup({ tokenError: 'Confirmation expired or the plan changed. Review it again.' });
    await click('[data-testid="acl-remove-preview"]', 0);
    await click('[data-testid="system-change-review-apply"]');
    await click('[data-testid="system-change-confirm"]');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toEqual([]);
  });
});
