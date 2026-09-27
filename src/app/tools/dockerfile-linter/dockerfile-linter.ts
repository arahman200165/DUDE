import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatDockerfile, lintDockerfile } from './dockerfile-linter-logic';

const DEFAULT_DOCKERFILE = 'FROM node\nADD app.js /app/\nRUN apt-get install -y curl\nEXPOSE 3000\nCMD ["node", "app.js"]';

@Component({
  selector: 'app-dockerfile-linter',
  imports: [ToolShell, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './dockerfile-linter.html',
})
export class DockerfileLinter {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('dockerfile-linter', 'input', 'session', DEFAULT_DOCKERFILE);

  protected readonly issues = computed(() => lintDockerfile(this.input()));
  protected readonly formatted = computed(() => formatDockerfile(this.input()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected applyFormat(): void {
    this.input.set(this.formatted());
  }
}
