import { Component, input, output } from '@angular/core';
import { FileDropMatch } from "@dude/domain/core/file-drop-detect/file-drop-detectors.model";

/** One candidate list for both Home and the desktop-wide drop surface. */
@Component({
  selector: 'app-file-drop-candidate-picker',
  templateUrl: './file-drop-candidate-picker.html',
})
export class FileDropCandidatePicker {
  readonly matches = input.required<readonly FileDropMatch[]>();
  readonly selected = output<string>();
}
