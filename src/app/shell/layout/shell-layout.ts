import { Component, HostListener, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { OfflineBadge } from '../../shared/components/offline-badge/offline-badge';
import { UpdateBadge } from '../../shared/components/update-badge/update-badge';
import { Onboarding } from '../onboarding/onboarding';
import { OnboardingService } from '../../core/platform/onboarding.service';
import { DesktopOpenService } from '../../core/platform/desktop-open.service';
import { DeepLinkService } from '../../core/deep-link/deep-link.service';
import { NativeMenuService } from '../../core/platform/native-menu.service';
import { QuickLauncherService } from '../../core/platform/quick-launcher.service';
import { AmbientPasteChip } from '../../shared/components/ambient-paste-chip/ambient-paste-chip';
import { GlobalDropRouter } from '../../shared/components/global-drop-router/global-drop-router';
import { CrashRecoveryNotice } from '../../shared/components/crash-recovery-notice/crash-recovery-notice';

@Component({
  selector: 'app-shell-layout',
  imports: [RouterOutlet, Sidebar, OfflineBadge, UpdateBadge, Onboarding, AmbientPasteChip, GlobalDropRouter, CrashRecoveryNotice],
  templateUrl: './shell-layout.html',
})
export class ShellLayout {
  private readonly paletteService = inject(CommandPaletteService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly onboarding = inject(OnboardingService);
  protected readonly desktopOpen = inject(DesktopOpenService);
  protected readonly deepLink = inject(DeepLinkService);
  protected readonly quickLauncher = inject(QuickLauncherService);

  constructor() { inject(NativeMenuService); void this.onboarding.initialize(); }

  protected readonly offline = computed(() => !this.connectivity.online());

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.paletteService.toggle();
    }
  }
}
