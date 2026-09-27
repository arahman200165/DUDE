import { Routes } from '@angular/router';
import { ShellLayout } from '../../shell/layout/shell-layout';
import { Deck } from '../../shell/deck/deck';
import { buildToolRoutes } from '../registry/tool-routes';
import { settingsUnsavedChangesGuard } from '../../shell/settings/settings-unsaved-changes';

// The Pipelines, Smart Paste, Workspace, History, Quick Run, Projects, and Settings routes below are
// the deliberate exceptions to "never edit this file to wire up a feature" (DUDE_PRD.md §21 Phase 21
// Items 2, 3, 4, and 5, Phase 24 Item 12, Phase 25 Item 1, and the Settings shell destination —
// see shell/AGENTS.md). Nothing here names a specific tool by id; all are parallel,
// registry-adjacent features, never a 278th tool.
export const routes: Routes = [
  {
    path: '',
    component: ShellLayout,
    children: [
      { path: '', component: Deck },
      {
        path: 'smart-paste',
        loadComponent: () => import('../../shell/smart-paste/smart-paste').then((m) => m.SmartPaste),
      },
      {
        path: 'workspace',
        loadComponent: () => import('../../shell/workspace/workspace-shell/workspace-shell').then((m) => m.WorkspaceShell),
      },
      {
        path: 'history',
        loadComponent: () => import('../../shell/history/history-page/history-page').then((m) => m.HistoryPage),
      },
      {
        path: 'quick-run',
        loadComponent: () => import('../../shell/quick-run/quick-run-list/quick-run-list').then((m) => m.QuickRunList),
      },
      {
        path: 'projects',
        loadComponent: () => import('../../shell/projects/project-list/project-list').then((m) => m.ProjectList),
      },
      { path: 'settings', redirectTo: 'settings/general', pathMatch: 'full' },
      {
        path: 'settings/tools/:toolId',
        loadComponent: () => import('../../shell/settings/settings-page/settings-page').then((m) => m.SettingsPage),
        canDeactivate: [settingsUnsavedChangesGuard],
      },
      {
        path: 'settings/:section',
        loadComponent: () => import('../../shell/settings/settings-page/settings-page').then((m) => m.SettingsPage),
        canDeactivate: [settingsUnsavedChangesGuard],
      },
      {
        path: 'pipelines',
        loadComponent: () => import('../../shell/pipelines/pipeline-list/pipeline-list').then((m) => m.PipelineList),
      },
      {
        path: 'pipelines/new',
        loadComponent: () => import('../../shell/pipelines/pipeline-builder/pipeline-builder').then((m) => m.PipelineBuilder),
      },
      // The static 'pipelines/scripts...' routes must come before the wildcard 'pipelines/:id'
      // below, or Angular's first-match routing would treat "scripts" as a pipeline id.
      {
        path: 'pipelines/scripts',
        loadComponent: () => import('../../shell/pipelines/script-list/script-list').then((m) => m.ScriptList),
      },
      {
        path: 'pipelines/scripts/new',
        loadComponent: () => import('../../shell/pipelines/script-editor/script-editor').then((m) => m.ScriptEditor),
      },
      {
        path: 'pipelines/scripts/:id',
        loadComponent: () => import('../../shell/pipelines/script-editor/script-editor').then((m) => m.ScriptEditor),
      },
      {
        path: 'pipelines/:id',
        loadComponent: () => import('../../shell/pipelines/pipeline-builder/pipeline-builder').then((m) => m.PipelineBuilder),
      },
      ...buildToolRoutes(),
    ],
  },
];
