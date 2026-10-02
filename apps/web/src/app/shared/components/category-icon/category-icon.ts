import { Component, input } from '@angular/core';
import { ToolCategory } from "@dude/shared-types/shared/models/tool-category.model";

@Component({
  selector: 'app-category-icon',
  templateUrl: './category-icon.html',
})
export class CategoryIcon {
  readonly category = input.required<ToolCategory>();
}
