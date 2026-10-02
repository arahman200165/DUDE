import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-udp-port-tester',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './udp-port-tester.html',
})
export class UdpPortTesterTool {}
