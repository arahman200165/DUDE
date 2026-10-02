import { Routes } from '@angular/router';
import { openLinkGuard } from '../deep-link/open-link.guard';
import { ShellLayout } from '../../shell/layout/shell-layout';
import { Deck } from '../../shell/deck/deck';
import { buildToolRoutes, withLoadFallback } from '../registry/tool-routes';
import { settingsUnsavedChangesGuard } from '../../shell/settings/settings-unsaved-changes';

// The Pipelines, Smart Paste, Workspace, History, Quick Run, Projects, Settings, Browse Tools, and Insights
// routes below are the deliberate exceptions to "never edit this file to wire up a feature"
// (DUDE_PRD.md §21 Phase 21 Items 2, 3, 4, and 5, Phase 24 Item 12, Phase 25 Item 1, the Settings
// shell destination, Phase 30A, and Phase 30H — see shell/AGENTS.md). Nothing here names a specific tool by id;
// all are parallel, registry-adjacent features, never a 278th tool. Every lazy destination is wrapped
// in `withLoadFallback` so an uncached chunk offline shows an explanation, not a blank app.

export const routes: Routes = [
  {
    path: '',
    component: ShellLayout,
    children: [
      { path: '', component: Deck },
      // web+dude:// protocol handler target for the installed PWA (Phase 26 Item 9). Guard-only.
      { path: 'open-link', canActivate: [openLinkGuard], children: [] },
      {
        path: 'smart-paste',
        loadComponent: withLoadFallback('SmartPaste', () => import('../../shell/smart-paste/smart-paste').then((m) => m.SmartPaste)),
      },
      {
        path: 'workspace',
        loadComponent: withLoadFallback('WorkspaceShell', () => import('../../shell/workspace/workspace-shell/workspace-shell').then((m) => m.WorkspaceShell)),
      },
      {
        path: 'history',
        loadComponent: withLoadFallback('HistoryPage', () => import('../../shell/history/history-page/history-page').then((m) => m.HistoryPage)),
      },
      {
        path: 'quick-run',
        loadComponent: withLoadFallback('QuickRunList', () => import('../../shell/quick-run/quick-run-list/quick-run-list').then((m) => m.QuickRunList)),
      },
      {
        path: 'projects',
        loadComponent: withLoadFallback('ProjectList', () => import('../../shell/projects/project-list/project-list').then((m) => m.ProjectList)),
      },
      {
        path: 'tools',
        loadComponent: withLoadFallback('BrowseTools', () => import('../../shell/browse-tools/browse-tools').then((m) => m.BrowseTools)),
      },
      {
        path: 'insights',
        loadComponent: withLoadFallback('InsightsPage', () => import('../../shell/insights/insights-page/insights-page').then((m) => m.InsightsPage)),
      },
      { path: 'settings', redirectTo: 'settings/general', pathMatch: 'full' },
      {
        path: 'settings/tools/:toolId',
        loadComponent: withLoadFallback('SettingsPage', () => import('../../shell/settings/settings-page/settings-page').then((m) => m.SettingsPage)),
        canDeactivate: [settingsUnsavedChangesGuard],
      },
      {
        path: 'settings/:section',
        loadComponent: withLoadFallback('SettingsPage', () => import('../../shell/settings/settings-page/settings-page').then((m) => m.SettingsPage)),
        canDeactivate: [settingsUnsavedChangesGuard],
      },
      {
        path: 'pipelines',
        loadComponent: withLoadFallback('PipelineList', () => import('../../shell/pipelines/pipeline-list/pipeline-list').then((m) => m.PipelineList)),
      },
      {
        path: 'pipelines/new',
        loadComponent: withLoadFallback('PipelineBuilder', () => import('../../shell/pipelines/pipeline-builder/pipeline-builder').then((m) => m.PipelineBuilder)),
      },
      // The static 'pipelines/scripts...' routes must come before the wildcard 'pipelines/:id'
      // below, or Angular's first-match routing would treat "scripts" as a pipeline id.
      {
        path: 'pipelines/scripts',
        loadComponent: withLoadFallback('ScriptList', () => import('../../shell/pipelines/script-list/script-list').then((m) => m.ScriptList)),
      },
      {
        path: 'pipelines/scripts/new',
        loadComponent: withLoadFallback('ScriptEditor', () => import('../../shell/pipelines/script-editor/script-editor').then((m) => m.ScriptEditor)),
      },
      {
        path: 'pipelines/scripts/:id',
        loadComponent: withLoadFallback('ScriptEditor', () => import('../../shell/pipelines/script-editor/script-editor').then((m) => m.ScriptEditor)),
      },
      {
        path: 'pipelines/:id',
        loadComponent: withLoadFallback('PipelineBuilder', () => import('../../shell/pipelines/pipeline-builder/pipeline-builder').then((m) => m.PipelineBuilder)),
      },
      ...buildToolRoutes(),
    ],
  },
];
