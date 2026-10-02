import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-mtu-discovery',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './mtu-discovery.html',
})
export class MtuDiscoveryTool {}
