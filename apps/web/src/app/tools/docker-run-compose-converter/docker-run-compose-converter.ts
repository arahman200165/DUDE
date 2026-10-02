import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { composeToDockerRun, dockerRunToCompose } from "@dude/tool-engine/tools/docker-run-compose-converter/docker-run-compose-converter-logic";

type Direction = 'run-to-compose' | 'compose-to-run';

@Component({
  selector: 'app-docker-run-compose-converter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './docker-run-compose-converter.html',
})
export class DockerRunComposeConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly direction = this.persistence.signal<Direction>('docker-run-compose-converter', 'direction', 'local', 'run-to-compose');
  protected readonly serviceName = this.persistence.signal('docker-run-compose-converter', 'serviceName', 'local', 'app');
  protected readonly input = this.persistence.signal(
    'docker-run-compose-converter',
    'input',
    'session',
    'docker run -p 8080:80 -e FOO=bar --name web nginx:1.27',
  );

  protected readonly result = computed(() =>
    this.direction() === 'run-to-compose'
      ? dockerRunToCompose(this.input(), this.serviceName())
      : composeToDockerRun(this.input(), this.serviceName()),
  );

  protected setDirection(direction: Direction): void {
    this.direction.set(direction);
  }

  protected onServiceNameInput(event: Event): void {
    this.serviceName.set((event.target as HTMLInputElement).value);
  }

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
