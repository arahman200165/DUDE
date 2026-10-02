import { Component } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';

@Component({
  selector: 'app-reverse-dns',
  imports: [NetworkWorkbench, DesktopOnlyControl],
  templateUrl: './reverse-dns.html',
})
export class ReverseDnsTool {}
