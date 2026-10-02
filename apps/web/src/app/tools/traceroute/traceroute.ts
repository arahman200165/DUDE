import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-traceroute',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './traceroute.html',
})
export class TracerouteTool {}
