import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-dns-propagation',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './dns-propagation.html',
})
export class DnsPropagationTool {}
