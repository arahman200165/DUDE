export interface ScheduledTaskSummary {
  readonly taskPath: string;
  readonly taskName: string;
  readonly state: string;
  readonly enabled: boolean;
  readonly lastRunTime: string | null;
  readonly nextRunTime: string | null;
  readonly lastTaskResult: number | null;
}
export interface ScheduledTaskTrigger {
  readonly type: string;
  readonly enabled: boolean | null;
  readonly startBoundary: string | null;
  readonly endBoundary: string | null;
  readonly repetition: string | null;
  readonly daysOfWeek: number | null;
  readonly weeksInterval: number | null;
}
export interface ScheduledTaskAction {
  readonly type: string;
  readonly execute: string | null;
  readonly arguments: string | null;
  readonly workingDirectory: string | null;
  readonly classId: string | null;
}
export interface ScheduledTaskPrincipal {
  readonly userId: string | null;
  readonly groupId: string | null;
  readonly logonType: string | null;
  readonly runLevel: string | null;
}
export interface ScheduledTaskDetail extends ScheduledTaskSummary {
  readonly triggers: readonly ScheduledTaskTrigger[];
  readonly actions: readonly ScheduledTaskAction[];
  readonly principal: ScheduledTaskPrincipal;
}