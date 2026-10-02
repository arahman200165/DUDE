import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { ScheduledTasksTool } from './scheduled-tasks';

describe('Scheduled Tasks confirmation boundary', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  it('only enables a disabled task after preview, review and confirm', async () => {
    const { bridge, calls } = recordingSysBridge();
    const task = { taskPath: '\\Microsoft\\Windows\\', taskName: 'Cleanup', state: 'Disabled', enabled: false, lastRunTime: null, nextRunTime: null, lastTaskResult: 0 };
    installBridge(fakeElectronBridge({
      ...bridge,
      sys: {
        ...bridge.sys,
        pwshStatus: async () => ({ available: true, path: 'pwsh.exe', version: '7.6.0', source: 'path' }),
        taskList: async () => [task],
        taskInfo: async () => ({ ...task, triggers: [], actions: [], principal: { userId: null, groupId: null, logonType: null, runLevel: null } }),
      },
    }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ScheduledTasksTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const row = [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((r) => r.textContent?.includes('Cleanup'))!;
    row.click();
    await settleFsJobs(fixture);
    const click = async (id: string) => { element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click(); await settleFsJobs(fixture); };
    await click('task-toggle-preview');
    expect(calls.plans[0].ops).toEqual([{ kind: 'task.enable', params: { taskPath: task.taskPath, taskName: task.taskName } }]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    await click('system-change-review-apply');
    expect(calls.applies).toEqual([]);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
  });
});
