import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-packet-loss',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './packet-loss.html',
})
export class PacketLossTool {}
