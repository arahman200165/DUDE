import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateModel, MODEL_LANGUAGES, ModelLanguage } from "@dude/tool-engine/tools/model-generator/model-generator-generate";

@Component({
  selector: 'app-model-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './model-generator.html',
})
export class ModelGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly languages = Object.entries(MODEL_LANGUAGES) as [ModelLanguage, string][];

  protected readonly input = this.persistence.signal(
    'model-generator',
    'input',
    'session',
    '{\n  "id": 1,\n  "name": "Ada Lovelace",\n  "address": {\n    "city": "London"\n  },\n  "tags": ["math", "computing"]\n}',
  );
  protected readonly rootName = this.persistence.signal('model-generator', 'rootName', 'local', 'User');
  protected readonly language = this.persistence.signal<ModelLanguage>('model-generator', 'language', 'local', 'typescript');

  protected readonly result = computed(() => generateModel(this.input(), this.rootName(), this.language()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRootNameChange(event: Event): void {
    this.rootName.set((event.target as HTMLInputElement).value);
  }

  protected onLanguageChange(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value as ModelLanguage);
  }
}
