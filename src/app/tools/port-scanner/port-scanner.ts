import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-port-scanner',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './port-scanner.html',
})
export class PortScannerTool {}
