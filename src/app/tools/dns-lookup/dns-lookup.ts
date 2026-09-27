import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-dns-lookup',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './dns-lookup.html',
})
export class DnsLookupTool {}
