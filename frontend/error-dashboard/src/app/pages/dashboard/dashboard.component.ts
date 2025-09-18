import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  // DI
  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  // Reactive form
  form = this.fb.group({
    start: [''],
    end: [''],
    userId: [''],
    browser: [''],
    url: [''],
    q: [''],
    page: [1],
    size: [50],
    sort: ['desc'],
  });

  // Auto-fetch (debounce) + koercija page/size u brojeve
  private formValue$ = this.form.valueChanges.pipe(
    startWith(this.form.getRawValue()),
    map(v => ({
      ...v,
      page: Number(v?.page ?? 1),
      size: Number(v?.size ?? 50),
    })),
    debounceTime(300),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );
  filters = toSignal(this.formValue$, { initialValue: { ...this.form.getRawValue(), page: 1, size: 50 } });

  // Loading state: odvojeno za search i stats
  searchLoading = signal(false);
  statsLoading  = signal(false);
  loading       = computed(() => this.searchLoading() || this.statsLoading());

  // Search & Stats (sa finalize za gašenje loading-a)
  search = toSignal(
    toObservable(this.filters).pipe(
      startWith(this.filters()),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap(f => {
        this.searchLoading.set(true);
        return this.api.getSearch(f).pipe(finalize(() => this.searchLoading.set(false)));
      })
    ),
    { initialValue: null }
  );

  stats = toSignal(
    toObservable(this.filters).pipe(
      startWith(this.filters()),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap(f => {
        this.statsLoading.set(true);
        return this.api.getStats(f).pipe(finalize(() => this.statsLoading.set(false)));
      })
    ),
    { initialValue: null }
  );

  // Derived
  cacheFlag = computed(() => this.search()?.cache ?? null);
  events    = computed(() => this.search()?.items ?? []);
  total     = computed(() => Number(this.search()?.total ?? 0));

  // Paging helpers
  currentPage = computed(() => Number(this.filters().page ?? 1));
  pageSize    = computed(() => Number(this.filters().size ?? 50));
  maxPage     = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  // Charts data kao signals (stabilna referenca → bez rekreacije canvas-a)
  browsersChartData       = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  errorMessagesChartData  = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });

  constructor() {
    // Ažuriraj chart podatke kad stignu stats
    toObservable(this.stats).subscribe(s => {
      if (!s) return;

      const topBrowsers = s.topBrowsers.slice(0, 5);
      const topErrors   = s.topErrorMessages.slice(0, 5);

      this.browsersChartData.set({
        labels: topBrowsers.map(b => b.key || 'unknown'),
        datasets: [{ data: topBrowsers.map(b => b.doc_count) }]
      });

      this.errorMessagesChartData.set({
        labels: topErrors.map(m => (m.key || 'unknown').slice(0, 40)),
        datasets: [{ data: topErrors.map(m => m.doc_count), label: 'Count' }]
      });
    });
  }

  // Submit/Reset
  onSubmit() {
    // ručno trigerovanje: vrati na prvu stranicu i emituj promenu
    this.form.patchValue({ page: 1 }, { emitEvent: true });
  }
  reset() {
    this.form.reset({ page: 1, size: 50, sort: 'desc' });
  }

  // Paging
  prevPage() {
    const p = Math.max(1, this.currentPage() - 1);
    this.form.patchValue({ page: p });
  }
  nextPage() {
    const p = Math.min(this.maxPage(), this.currentPage() + 1);
    this.form.patchValue({ page: p });
  }

  // Chart options
  pieOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    layout: { padding: 8 }
  };
  barOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    plugins: { legend: { display: false } },
    layout: { padding: 8 }
  };
}
