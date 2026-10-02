import { MatrixCalculatorTool_formatMatrix, roundDisplay } from "@dude/tool-engine/tools/matrix-calculator/matrix-calculator.embedded-engine";
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { Matrix, MatrixOp, MatrixOpResult, computeMatrixOp, parseMatrix } from "@dude/tool-engine/tools/matrix-calculator/matrix-calculate";
import { MatrixWorkerPayload, MatrixWorkerResult } from "@dude/tool-engine/tools/matrix-calculator/matrix-worker-payload";

/** Above this many cells in A, dispatch to a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD_CELLS = 400;

const OPS: readonly { readonly id: MatrixOp; readonly label: string; readonly binary: boolean }[] = [
  { id: 'add', label: 'A + B', binary: true },
  { id: 'sub', label: 'A - B', binary: true },
  { id: 'mul', label: 'A × B', binary: true },
  { id: 'transpose-a', label: 'Transpose(A)', binary: false },
  { id: 'det-a', label: 'det(A)', binary: false },
  { id: 'inv-a', label: 'inv(A)', binary: false },
  { id: 'scalar-mul-a', label: 'k × A', binary: false },
];

@Component({
  selector: 'app-matrix-calculator',
  imports: [ToolShell, BusyIndicator, ErrorPanel, CopyButton],
  templateUrl: './matrix-calculator.html',
})
export class MatrixCalculatorTool {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly ops = OPS;
  protected readonly op = this.persistence.signal<MatrixOp>('matrix-calculator', 'op', 'local', 'mul');
  protected readonly matrixAInput = this.persistence.signal('matrix-calculator', 'matrixA', 'session', '1, 2\n3, 4');
  protected readonly matrixBInput = this.persistence.signal('matrix-calculator', 'matrixB', 'session', '5, 6\n7, 8');
  protected readonly scalarInput = this.persistence.signal('matrix-calculator', 'scalar', 'session', '2');

  private readonly jobSignal = signal<WorkerJob<MatrixWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly isBinary = computed(() => this.ops.find((o) => o.id === this.op())?.binary === true);
  protected readonly isScalarOp = computed(() => this.op() === 'scalar-mul-a');

  protected readonly matrixA = computed(() => parseMatrix(this.matrixAInput()));
  protected readonly matrixB = computed(() => parseMatrix(this.matrixBInput()));
  protected readonly scalar = computed(() => Number(this.scalarInput()));

  protected readonly usesWorker = computed(() => {
    const a = this.matrixA();
    return a !== null && a.length * (a[0]?.length ?? 0) > WORKER_THRESHOLD_CELLS;
  });

  private readonly syncResult = computed<MatrixOpResult | null>(() => {
    if (this.usesWorker()) return null;

    const a = this.matrixA();
    if (a === null) return { ok: false, error: 'Matrix A is invalid: every row must have the same number of numeric values.' };

    const b = this.isBinary() ? this.matrixB() : null;
    if (this.isBinary() && b === null) {
      return { ok: false, error: 'Matrix B is required and must have consistent, numeric row lengths.' };
    }

    return computeMatrixOp(a, b, this.op(), this.scalar());
  });

  protected readonly result = computed<MatrixOpResult | null>(() => {
    if (!this.usesWorker()) return this.syncResult();
    return this.job()?.result() ?? null;
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.usesWorker()) return;

      const a = this.matrixA();
      if (a === null) return;

      const b = this.isBinary() ? this.matrixB() : null;
      if (this.isBinary() && b === null) return;

      const job = this.workerClient.run<MatrixWorkerPayload, MatrixWorkerResult>(
        () => new Worker(new URL('./matrix-calculator.worker', import.meta.url), { type: 'module' }),
        { a, b, op: this.op(), scalar: this.scalar() },
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected setOp(op: MatrixOp): void {
    this.op.set(op);
  }

  protected onMatrixAChange(event: Event): void {
    this.matrixAInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onMatrixBChange(event: Event): void {
    this.matrixBInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onScalarChange(event: Event): void {
    this.scalarInput.set((event.target as HTMLInputElement).value);
  }
  protected formatMatrix = MatrixCalculatorTool_formatMatrix;

}
