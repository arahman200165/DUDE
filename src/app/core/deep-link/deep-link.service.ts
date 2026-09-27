import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OnboardingService } from '../platform/onboarding.service';
import { PlatformService } from '../platform/platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { WorkspaceTemplateService } from '../workspace/workspace-template.service';
import { ProjectService } from '../project/project.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { parseDudeDeepLink } from './deep-link.model';

/** Shown when a pipeline/project link names an id this install doesn't have (Phase 26 Item 8). */
export const PER_INSTALL_ID_HINT =
  'Pipeline and project IDs are per install. Export a bundle where it lives, then import it here under Settings › Data & Privacy.';

/**
 * Renderer-only interpretation of `dude://` links: forwarded by Electron on desktop, and by the
 * installed PWA's `web+dude://` protocol handler on the web (`accept`, Phase 26 Item 9). `run`
 * links only ever navigate with a pending-confirmation flag. Nothing executes from a link alone.
 */
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly platform = inject(PlatformService);
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);
  private readonly tools = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly templates = inject(WorkspaceTemplateService);
  private readonly projects = inject(ProjectService);
  private readonly pipelines = inject(PipelineStoreService);
  private readonly pending = signal<readonly string[]>([]);
  readonly error = signal('');
  private processing = false;

  constructor() {
    effect(() => {
      if (this.onboarding.initialized() && !this.onboarding.visible() && this.pending().length) void this.flush();
    });
    if (!this.platform.isDesktop()) return;
    window.dude!.deepLink.onItem((url) => this.accept(url));
    window.dude!.deepLink.ready();
  }

  /** Queues a raw `dude://` link for the same strict parse + navigation, on either platform. */
  accept(raw: string): void {
    this.pending.update((items) => [...items, raw]);
  }

  private async flush(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pending().length && !this.onboarding.visible()) {
        const raw = this.pending()[0];
        this.pending.update((items) => items.slice(1));
        const link = parseDudeDeepLink(raw);
        if (!link) { this.error.set('This DUDE link is invalid.'); continue; }
        if (link.action === 'run') {
          if (link.target === 'pipeline') {
            if (!this.pipelines.getById(link.id)) { this.error.set(`The linked pipeline isn't on this install. ${PER_INSTALL_ID_HINT}`); continue; }
            await this.router.navigateByUrl('/', { skipLocationChange: true });
            await this.router.navigate(['/pipelines', link.id], { queryParams: { confirmRun: '1' } });
          } else {
            if (!this.tools.getById(link.id)) { this.error.set('The linked tool was not found.'); continue; }
            await this.router.navigateByUrl('/', { skipLocationChange: true });
            await this.router.navigate(['/quick-run'], { queryParams: { tool: link.id, confirmRun: '1' } });
          }
          continue;
        }

        if (link.target === 'settings') {
          // An unknown section id is handled by the Settings page itself (falls back to General).
          await this.router.navigateByUrl(link.section ? `/settings/${link.section}` : '/settings');
        } else if (link.target === 'tool') {
          const tool = this.tools.getById(link.id);
          if (tool) this.launcher.open(tool);
          else this.error.set('The linked tool was not found.');
        } else if (link.target === 'workspace-template') {
          const template = this.templates.templates().find((candidate) => candidate.id === link.id);
          if (!template) { this.error.set('The linked workspace template was not found.'); continue; }
          this.templates.apply(template);
          await this.router.navigateByUrl('/workspace');
        } else if (link.target === 'project') {
          if (!this.projects.getById(link.id)) { this.error.set(`The linked project isn't on this install. ${PER_INSTALL_ID_HINT}`); continue; }
          this.projects.activate(link.id);
          await this.router.navigateByUrl('/workspace');
        } else {
          if (!this.pipelines.getById(link.id)) { this.error.set(`The linked pipeline isn't on this install. ${PER_INSTALL_ID_HINT}`); continue; }
          await this.router.navigateByUrl('/', { skipLocationChange: true });
          await this.router.navigate(['/pipelines', link.id]);
        }
      }
    } finally { this.processing = false; }
  }
}
