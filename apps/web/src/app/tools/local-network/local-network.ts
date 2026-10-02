import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-local-network',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './local-network.html',
})
export class LocalNetworkTool {}
