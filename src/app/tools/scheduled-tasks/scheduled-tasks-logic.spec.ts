import { describe, expect, it } from 'vitest';
import type { ScheduledTaskSummary } from '../../../shared-logic/system/task-types';
import { filterTasks, taskFolders, taskKey, taskToggleRequest } from './scheduled-tasks-logic';

const tasks: ScheduledTaskSummary[] = [
  { taskPath: '\\', taskName: 'Root', state: 'Ready', enabled: true, lastRunTime: null, nextRunTime: null, lastTaskResult: 0 },
  { taskPath: '\\Microsoft\\Windows\\', taskName: 'Cleanup', state: 'Disabled', enabled: false, lastRunTime: null, nextRunTime: null, lastTaskResult: 2 },
];

describe('Scheduled Tasks view logic', () => {
  it('builds folders and filters nested paths', () => {
    expect(taskFolders(tasks).map((f) => f.path)).toEqual(['\\', '\\Microsoft\\', '\\Microsoft\\Windows\\']);
    expect(filterTasks(tasks, '\\Microsoft\\', 'cleanup')).toEqual([tasks[1]]);
  });

  it('creates a preview request for the opposite enabled state', () => {
    expect(taskKey(tasks[1])).toBe('\\Microsoft\\Windows\\Cleanup');
    expect(taskToggleRequest(tasks[1]).ops[0]).toEqual({ kind: 'task.enable', params: { taskPath: tasks[1].taskPath, taskName: 'Cleanup' } });
  });
});
