import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DESKTOP_RELEASES_URL, DesktopHandoffService, HandoffResult } from '../../../core/deep-link/desktop-handoff.service';
import { DudeDeepLink } from "@dude/domain/core/deep-link/deep-link.model";

/**
 * "Open in Desktop DUDE" (Phase 26 Item 8), rendered only on the web companion. For pipelines and
 * projects, whose ids are per install, it first explains that and points at the export bundle,
 * rather than opening a link that lands on "not found". If Desktop DUDE doesn't take focus, it
 * offers the download.
 */
@Component({
  selector: 'app-open-in-desktop',
  imports: [RouterLink],
  templateUrl: './open-in-desktop.html',
})
export class OpenInDesktop {
  protected readonly handoff = inject(DesktopHandoffService);

  readonly link = input.required<DudeDeepLink>();
  readonly variant = input<'button' | 'menuitem'>('button');

  protected readonly releasesUrl = DESKTOP_RELEASES_URL;
  protected readonly confirmingPerInstall = signal(false);
  protected readonly result = signal<HandoffResult | null>(null);
  protected readonly perInstall = computed(() => {
    const link = this.link();
    return link.target === 'pipeline' || link.target === 'project';
  });
  protected readonly available = computed(() => this.handoff.enabled && this.handoff.linkFor(this.link()) !== null);

  protected start(): void {
    this.result.set(null);
    if (this.perInstall()) this.confirmingPerInstall.set(true);
    else void this.launch();
  }

  protected openAnyway(): void {
    this.confirmingPerInstall.set(false);
    void this.launch();
  }

  private async launch(): Promise<void> {
    this.result.set(await this.handoff.open(this.link()));
  }
}
