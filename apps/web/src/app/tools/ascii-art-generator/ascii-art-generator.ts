import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ASCII_ART_FONTS } from "@dude/tool-engine/tools/ascii-art-generator/ascii-art-fonts";
import { renderAsciiArt } from "@dude/tool-engine/tools/ascii-art-generator/ascii-art-render";

@Component({
  selector: 'app-ascii-art-generator',
  imports: [ToolShell, CopyButton],
  templateUrl: './ascii-art-generator.html',
})
export class AsciiArtGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly fonts = ASCII_ART_FONTS;

  protected readonly input = this.persistence.signal('ascii-art-generator', 'input', 'session', 'DUDE');
  protected readonly font = this.persistence.signal('ascii-art-generator', 'font', 'local', 'Standard');

  protected readonly output = computed(() => renderAsciiArt(this.input(), this.font()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  protected onFontChange(event: Event): void {
    this.font.set((event.target as HTMLSelectElement).value);
  }
}
