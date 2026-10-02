import { bootstrapApplication } from '@angular/platform-browser';
import './app/core/platform/engine-host.adapter';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
