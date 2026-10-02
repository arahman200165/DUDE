import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeviceStoreHealthService } from '../../core/device/device-store-health.service';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';

/**
 * Desktop-only strip shown while the Device Store is not `ready` (degraded, unavailable, incompatible
 * or corrupt): nothing is being saved, so say so. Part of the framework shell, mounted once by
 * `ShellLayout`. It never renders on web, where `DeviceStoreHealthService.degraded()` is always false.
 */
@Component({
  selector: 'app-device-store-banner',
  imports: [StatusGlyph],
  templateUrl: './device-store-banner.html',
})
export class DeviceStoreBanner {
  private readonly health = inject(DeviceStoreHealthService);
  private readonly router = inject(Router);

  protected readonly visible = this.health.degraded;
  protected readonly retrying = this.health.retrying;
  protected readonly reason = computed(() => {
    switch (this.health.status()) {
      case 'incompatible': return 'This store was written by a newer DUDE version.';
      case 'corrupt': return 'The store file is damaged.';
      default: return this.health.degradedReason() ?? '';
    }
  });

  protected retry(): void {
    void this.health.retry();
  }

  protected details(): void {
    void this.router.navigateByUrl('/settings');
  }
}
