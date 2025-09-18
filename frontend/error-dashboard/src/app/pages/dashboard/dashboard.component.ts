import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
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
  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  // helper: format za <input type="datetime-local">
  private toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // max vrednost (sada) za oba pickera
  maxDateTime = signal(this.toLocalInputValue(new Date()));

  // custom validator: start ≤ end, start ≤ now (i end ≤ now radi max atribut)
  private dateRangeValidator(): ValidatorFn {
    return (ctrl: AbstractControl): ValidationErrors | null => {
      const startRaw = ctrl.get('start')?.value as string | null;
      const endRaw   = ctrl.get('end')?.value as string | null;
      const now = new Date();

      const s = startRaw ? new Date(startRaw) : null;
      const e = endRaw   ? new Date(endRaw)   : null;

      if (s && s > now) return { startInFuture: true };
      if (s && e && s > e) return { startAfterEnd: true };
      return null;
    };
  }

  form = this.fb.group({
    start: [''],    
    end: [''],
    userId: [''],
    browser: [''],
    url: [''],
    keyword: [''],
    page: [1],
    size: [50],
    sort: ['desc'],
  }, { validators: this.dateRangeValidator() });

  private normalizeFilters = (v: any) => ({
    ...v,
    page: Number(v?.page ?? 1),
    size: Number(v?.size ?? 50),
    start: v?.start ? new Date(v.start as string).toISOString() : '',
    end:   v?.end   ? new Date(v.end   as string).toISOString() : '',
  });
  
  // Auto-fetch (debounce) + koercija + ISO konverzija
  private formValue$ = this.form.valueChanges.pipe(
    startWith(this.normalizeFilters(this.form.getRawValue())),
    map(v => this.normalizeFilters(v)),
    debounceTime(300),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );

  filters = toSignal(this.formValue$, { initialValue: { ...this.form.getRawValue(), page: 1, size: 50 } });

  // loading state
  searchLoading = signal(false);
  statsLoading  = signal(false);
  loading       = computed(() => this.searchLoading() || this.statsLoading());

  // data pozivi
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

  // izvedeno
  cacheFlag = computed(() => this.search()?.cache ?? null);
  events    = computed(() => this.search()?.items ?? []);
  total     = computed(() => Number(this.search()?.total ?? 0));

  currentPage = computed(() => Number(this.filters().page ?? 1));
  pageSize    = computed(() => Number(this.filters().size ?? 50));
  maxPage     = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  // charts
  browsersChartData      = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  errorMessagesChartData = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });

  constructor() {
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

  onSubmit() {
    if (this.form.invalid) return;              // ne šalji ako datumi nisu validni
    this.form.patchValue({ page: 1 }, { emitEvent: true });
  }
  reset() {
    this.form.reset({ page: 1, size: 50, sort: 'desc' });
  }
  prevPage() { this.form.patchValue({ page: Math.max(1, this.currentPage() - 1) }); }
  nextPage() { this.form.patchValue({ page: Math.min(this.maxPage(), this.currentPage() + 1) }); }


  setPreset(kind: '1h'|'24h'|'7d') {
    const end = new Date();
    const start = new Date(end);
    if (kind === '1h')  start.setHours(end.getHours() - 1);
    if (kind === '24h') start.setDate(end.getDate() - 1);
    if (kind === '7d')  start.setDate(end.getDate() - 7);
  
    this.form.patchValue({
      start: this.toLocalInputValue(start),
      end:   this.toLocalInputValue(end),
      page: 1
    });
  }


  pieOptions: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, layout: { padding: 8 } };
  barOptions: any = { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } }, layout: { padding: 8 } };
}
