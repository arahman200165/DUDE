import type { ScheduledTaskSummary } from "@dude/contracts/system/task-types";
import type { SysPlanRequest } from "@dude/contracts/system/sys-mutation-types";

export function taskKey(task: Pick<ScheduledTaskSummary, 'taskPath' | 'taskName'>): string {
  return `${task.taskPath}${task.taskName}`;
}

export function taskFolders(tasks: readonly ScheduledTaskSummary[]): readonly { path: string; depth: number; count: number }[] {
  const counts = new Map<string, number>();
  counts.set('\\', tasks.length);
  for (const task of tasks) {
    const parts = task.taskPath.split('\\').filter(Boolean);
    let path = '\\';
    for (const part of parts) {
      path += `${part}\\`;
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts].map(([path, count]) => ({ path, depth: path === '\\' ? 0 : path.split('\\').filter(Boolean).length, count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function filterTasks(tasks: readonly ScheduledTaskSummary[], folder: string, query: string): readonly ScheduledTaskSummary[] {
  const q = query.trim().toLowerCase();
  return tasks.filter((task) => task.taskPath.startsWith(folder) &&
    (!q || task.taskName.toLowerCase().includes(q) || task.taskPath.toLowerCase().includes(q) || task.state.toLowerCase().includes(q)));
}

export function taskToggleRequest(task: Pick<ScheduledTaskSummary, 'taskPath' | 'taskName' | 'enabled'>): SysPlanRequest {
  const enable = !task.enabled;
  return {
    tool: 'scheduled-tasks',
    title: `${enable ? 'Enable' : 'Disable'} scheduled task: ${taskKey(task)}`,
    ops: [{ kind: enable ? 'task.enable' : 'task.disable', params: { taskPath: task.taskPath, taskName: task.taskName } }],
  };
}
