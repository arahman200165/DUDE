import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-connectivity-tester',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './connectivity-tester.html',
})
export class ConnectivityTesterTool {}
