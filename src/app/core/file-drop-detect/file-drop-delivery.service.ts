import { Injectable, inject } from '@angular/core';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { FileDropHandoffService } from './file-drop-handoff.service';
import { TextInputHandoffService } from '../text-file-input/text-input-handoff.service';
import { readTextFile } from '../text-file-input/text-file-read';
import { textFileInputOf } from '../text-file-input/imported-file-flags';

/**
 * The one "give this dropped file to that tool" step shared by the dashboard's Smart File Drop
 * zone and the desktop window-level drop router. A tool with a text input (`textFileInputOf`) gets the file's
 * *text* written into its input (see `TextInputHandoffService`); every other tool gets the `File`
 * itself, which its `app-file-drop` widget consumes on first render.
 */
@Injectable({ providedIn: 'root' })
export class FileDropDeliveryService {
  private readonly fileHandoff = inject(FileDropHandoffService);
  private readonly textHandoff = inject(TextInputHandoffService);

  /** Resolves `null` on success, or a user-facing reason the file couldn't be delivered. */
  async deliver(tool: ToolDefinition, file: File): Promise<string | null> {
    if (!textFileInputOf(tool)) {
      this.fileHandoff.offer(tool.id, file);
      return null;
    }
    const result = await readTextFile(file);
    if (!result.ok) return result.error;
    this.textHandoff.offer(tool, result.text, result.name);
    return null;
  }
}
