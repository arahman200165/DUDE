import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-route-comparison',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './route-comparison.html',
})
export class RouteComparisonTool {}
