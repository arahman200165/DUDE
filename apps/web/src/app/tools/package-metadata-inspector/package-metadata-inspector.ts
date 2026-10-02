import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { lookupPackage } from "@dude/tool-engine/tools/package-metadata-inspector/package-metadata-lookup";
import { PACKAGE_ECOSYSTEMS, PackageEcosystem, PackageMetadata } from "@dude/tool-engine/tools/package-metadata-inspector/package-metadata-types";

@Component({
  selector: 'app-package-metadata-inspector',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './package-metadata-inspector.html',
})
export class PackageMetadataInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly ecosystems = Object.entries(PACKAGE_ECOSYSTEMS) as [PackageEcosystem, string][];

  protected readonly ecosystem = this.persistence.signal<PackageEcosystem>('package-metadata-inspector', 'ecosystem', 'local', 'npm');
  protected readonly packageName = this.persistence.signal('package-metadata-inspector', 'packageName', 'session', 'lodash');

  protected readonly loading = signal(false);
  protected readonly hasQueried = signal(false);
  protected readonly metadata = signal<PackageMetadata | null>(null);
  protected readonly error = signal('');

  protected onEcosystemChange(event: Event): void {
    this.ecosystem.set((event.target as HTMLSelectElement).value as PackageEcosystem);
  }

  protected onPackageNameChange(event: Event): void {
    this.packageName.set((event.target as HTMLInputElement).value);
  }

  protected async lookup(): Promise<void> {
    this.hasQueried.set(true);
    this.loading.set(true);
    this.error.set('');
    this.metadata.set(null);

    const result = await lookupPackage(this.ecosystem(), this.packageName());
    if (result.ok) {
      this.metadata.set(result.metadata);
    } else {
      this.error.set(result.error);
    }
    this.loading.set(false);
  }
}
