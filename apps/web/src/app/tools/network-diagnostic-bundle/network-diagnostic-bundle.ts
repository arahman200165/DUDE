import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-network-diagnostic-bundle',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './network-diagnostic-bundle.html',
})
export class NetworkDiagnosticBundleTool {}
