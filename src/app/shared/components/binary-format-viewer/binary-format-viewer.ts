import { Component, input, output } from '@angular/core';
import { FileDrop } from '../file-drop/file-drop';
import { BusyIndicator, BusyIndicatorStatus } from '../busy-indicator/busy-indicator';
import { ErrorPanel } from '../error-panel/error-panel';
import { TreeView, TreeNode } from '../tree-view/tree-view';
import { DataTable } from '../data-table/data-table';
import { SimpleColumnsPipe } from '../data-table/simple-columns.pipe';

/**
 * Shared shell for the binary-format viewer tools (Protobuf, MessagePack,
 * BSON, CBOR, Avro, Parquet, SQLite): a file drop zone, a busy/error status
 * line, and either a structural tree (most formats) or a table (SQLite,
 * Parquet) for the decoded result. Each tool owns its own file-reading and
 * decode call — this is presentational only, mirroring `DataTable`/`TreeView`.
 */
@Component({
  selector: 'app-binary-format-viewer',
  imports: [FileDrop, BusyIndicator, ErrorPanel, TreeView, DataTable, SimpleColumnsPipe],
  templateUrl: './binary-format-viewer.html',
})
export class BinaryFormatViewer {
  readonly accept = input<string | undefined>(undefined);
  readonly dropLabel = input('Drop a file here, or click to browse');
  readonly fileName = input<string | null>(null);
  readonly status = input.required<BusyIndicatorStatus>();
  readonly errorMessage = input<string | null>(null);
  readonly treeNodes = input<readonly TreeNode[] | null>(null);
  readonly tableColumns = input<readonly string[] | null>(null);
  readonly tableRows = input<readonly (readonly string[])[] | null>(null);

  readonly fileSelected = output<File>();
  readonly rejected = output<string>();

  protected onFileSelected(file: File): void {
    this.fileSelected.emit(file);
  }

  protected onRejected(message: string): void {
    this.rejected.emit(message);
  }
}
