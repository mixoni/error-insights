import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import {
  debounceTime,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  combineLatest,
  of,
  timer,
} from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { registerLocaleData } from '@angular/common';
import localeSr from '@angular/common/locales/sr';

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

  // --- Helpers for datetime-local ---
  private toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  maxDateTime = signal(this.toLocalInputValue(new Date())); // max (now) for both pickers

  // --- Validators: start ≤ end, start ≤ now ---
  private dateRangeValidator(): ValidatorFn {
    return (ctrl: AbstractControl): ValidationErrors | null => {
      const startRaw = ctrl.get('start')?.value as string | null;
      const endRaw   = ctrl.get('end')?.value as string | null;
      const now = new Date();

      const s = startRaw ? new Date(startRaw) : null;
      const e = endRaw   ? new Date(endRaw)   : null;

      if (s && s > now) return { startInFuture: true };
      if (s && e && s > e) return { startAfterEnd: true };
      if (e && e > now) return { endInFuture: true };
      return null;
    };
  }

  // --- Reactive form ---
  form = this.fb.group({
    start: [''],  // 'YYYY-MM-DDTHH:mm' (local)
    end:   [''],
    userId: [''],
    browser: [''],
    url: [''],
    q: [''],
    page: [1],
    size: [50],
    sort: ['desc'],
  }, { validators: this.dateRangeValidator() });

  // --- Normalized filters signal (debounced) ---
  private normalize = (v: any) => ({
    ...v,
    page: Number(v?.page ?? 1),
    size: Number(v?.size ?? 50),
    start: v?.start ? new Date(v.start as string).toISOString() : '',
    end:   v?.end   ? new Date(v.end   as string).toISOString() : '',
  });

  private formValue$ = this.form.valueChanges.pipe(
    startWith(this.normalize(this.form.getRawValue())),
    map(v => this.normalize(v)),
    debounceTime(300),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );
  filters = toSignal(this.formValue$, {
    initialValue: this.normalize(this.form.getRawValue())
  });

  // --- Loading states ---
  searchLoading = signal(false);
  statsLoading  = signal(false);
  loading       = computed(() => this.searchLoading() || this.statsLoading());

  // --- SEARCH (ES) ---
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

  // --- Stats source toggle: ES aggs or Redis widgets ---
  statsSource = signal<'es' | 'redis'>('es');
  redisScope  = signal<'global' | '1h'>('1h');
  autoRefresh = signal<boolean>(false); // for Redis mode, 10s

  // ES stats (respect filters)
  esStats = toSignal(
    toObservable(this.filters).pipe(
      startWith(this.filters()),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap(f => this.api.getStats(f))
    ),
    { initialValue: null }
  );

  // Redis widgets (global / 1h) + optional auto-refresh (10s)
  redisStats = toSignal(
    combineLatest([
      toObservable(this.statsSource),
      toObservable(this.redisScope),
      toObservable(this.autoRefresh)
    ]).pipe(
      switchMap(([src, scope, auto]) => {
        if (src !== 'redis') return of(null); // do not poll when not in Redis mode
        return timer(0, auto ? 10000 : Infinity).pipe(
          switchMap(() => this.api.getWidgetsTop(scope, 5))
        );
      })
    ),
    { initialValue: null }
  );

  // Unified stats view for charts
  statsView = computed(() => {
    const fromRedis = this.statsSource() === 'redis';
  
    if (fromRedis) {
      const r = this.redisStats();
      if (!r) return null;
  
      const topBrowsers = (r.topBrowsers ?? []).map(x => ({ key: x.key, doc_count: x.count }));
      const topErrorMessages = (r.topErrorMessages ?? []).map(x => ({ key: x.key, doc_count: x.count }));
  
      const hasData =
        topBrowsers.some(x => (x.doc_count ?? 0) > 0) ||
        topErrorMessages.some(x => (x.doc_count ?? 0) > 0);
  
      if (!hasData) return null;
  
      return {
        topBrowsers,
        topErrorMessages,
        cache: r.cache ?? 'hit'
      };
    }
  
    // ES grana – obavezno vrati null kad nema podataka
    const es = this.esStats();
    if (!es) return null;
  
    const hasData =
      (es.topBrowsers?.some(x => (x.doc_count ?? 0) > 0) ?? false) ||
      (es.topErrorMessages?.some(x => (x.doc_count ?? 0) > 0) ?? false);
  
    return hasData ? es : null;
  });
  

  // --- Derived from search ---
  cacheFlag = computed(() => this.search()?.cache ?? null);
  events    = computed(() => this.search()?.items ?? []);
  total     = computed(() => Number(this.search()?.total ?? 0));

  // --- Paging helpers ---
  currentPage = computed(() => Number(this.filters().page ?? 1));
  pageSize    = computed(() => Number(this.filters().size ?? 50));
  maxPage     = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  // --- Charts data (stable references) ---
  browsersChartData      = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  errorMessagesChartData = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });

  constructor() {
    registerLocaleData(localeSr, 'sr-RS');
    // update charts whenever active stats source/view changes
    toObservable(this.statsView).subscribe(s => {
      if (!s) return;
      const topBrowsers = (s.topBrowsers || []).slice(0, 5);
      const topErrors   = (s.topErrorMessages || []).slice(0, 5);

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

  // --- Form actions ---
  onSubmit() {
    if (this.form.invalid) return;
    this.form.patchValue({ page: 1 }, { emitEvent: true });
  }
  reset() {
    this.form.reset({ page: 1, size: 50, sort: 'desc' });
  }

  // Presets (Last 1h / 24h / 7d)
  setPreset(kind: '1h' | '24h' | '7d') {
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

  // --- Paging actions ---
  prevPage() { this.form.patchValue({ page: Math.max(1, this.currentPage() - 1) }); }
  nextPage() { this.form.patchValue({ page: Math.min(this.maxPage(), this.currentPage() + 1) }); }

  // --- Chart options ---
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

  // === NOVO: mod prikaza ===
viewMode = signal<'paged'|'infinite'>('paged'); 
toggleViewMode(mode: 'paged'|'infinite') {
  if (this.viewMode() === mode) return;
  
  this.viewMode.set(mode);

  if (mode === 'infinite') {
    this.ptItems.set([]);
    this.cursorToken.set(null);
    this.ptDone.set(false);
    this.loadFirstPt();
  } 
}

// === NOVO: go-to page (samo za 'paged') ===
gotoPageInput = signal<number | null>(null);
goToPage() {
  const p = Number(this.gotoPageInput() ?? NaN);
  if (!Number.isFinite(p) || p < 1) return;
  // “window guard”: ne dozvoli offset > 10k
  const maxPageByWindow = this.maxPageByWindow();
  const clamped = Math.min(p, maxPageByWindow);
  this.form.patchValue({ page: clamped });
}

updateGotoPageInput(value: string) {
  this.gotoPageInput.set(value ? Number(value) : null);
}

// === NOVO: guard za ES max_result_window (10k by default)
private readonly ES_MAX_WINDOW = 10000; // limit by ES by default
maxPageByWindow = computed(() => {
  const size = this.pageSize();
  if (size <= 0) return 1;
  return Math.max(1, Math.floor(this.ES_MAX_WINDOW / size));
});
windowCapped = computed(() => this.currentPage() >= this.maxPageByWindow());

// === NOVO: PT (PIT/search_after) state – zadržavamo raniju skicu, samo je dodaj ako je nemaš
cursorToken = signal<string | null>(null);
ptItems = signal<any[]>([]);
ptDone = signal(false);
ptLoading = signal(false);

private trimUndef(v: any) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? t : undefined;
  }
  return v;
}

private buildPtFilters(cursor: string | null) {
  const f = this.form.getRawValue();
  return {
    start: this.trimUndef(f.start),
    end: this.trimUndef(f.end),
    userId: this.trimUndef(f.userId),
    browser: this.trimUndef(f.browser),
    url: this.trimUndef(f.url),
    keyword: this.trimUndef(f.q),
    size: this.trimUndef(f.size),
    sort: this.trimUndef(f.sort),
    cursor: cursor ?? undefined,  
  } as const;
}

loadFirstPt() {
  this.ptLoading.set(true);
  const params = this.buildPtFilters(null);
  this.api.getSearchPt(params).subscribe(res => {
    this.ptItems.set(res.items ?? []);
    this.cursorToken.set(res.cursor ?? null);
    this.ptDone.set(!!res.done);
    this.ptLoading.set(false);
  });
}


loadMorePt() {
  if (this.ptDone() || !this.cursorToken()) return;
  this.ptLoading.set(true);
  const params = this.buildPtFilters(this.cursorToken());
  this.api.getSearchPt(params).subscribe(res => {
    this.ptItems.set([...(this.ptItems() ?? []), ...(res.items ?? [])]);
    this.cursorToken.set(res.cursor ?? null);
    this.ptDone.set(!!res.done);
    this.ptLoading.set(false);
  });
}


}
