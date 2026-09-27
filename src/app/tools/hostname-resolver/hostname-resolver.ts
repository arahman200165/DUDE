import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-hostname-resolver',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './hostname-resolver.html',
})
export class HostnameResolverTool {}
