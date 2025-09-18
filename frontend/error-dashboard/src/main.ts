import 'chart.js/auto';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Routes } from '@angular/router';
import { DashboardComponent } from './app/pages/dashboard/dashboard.component';

const routes: Routes = [
  { path: '', component: DashboardComponent },
];

bootstrapApplication(DashboardComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(routes),
  ],
}).catch(err => console.error(err));
