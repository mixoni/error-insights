import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  timer,
  of,
  Subscription,
} from 'rxjs';

import { BaseChartDirective } from 'ng2-charts';
import { ApiService } from '../../services/api.service';

// Child components
import { FiltersBarComponent } from '../../components/filters-bar/filters-bar.component';
import { ErrorsTableComponent } from '../../components/errors-table/errors-table.component';
import { PagedFooterComponent } from '../../components/paged-footer/paged-footer.component';
import { InfiniteFooterComponent } from '../../components/infinite-footer/infinite-footer.component';
import { adaptStats } from '../../utils/utils.service';

type ViewMode = 'paged' | 'infinite';
type StatsSource = 'es' | 'redis';
type RedisScope = '1h' | 'global';

type NormalizedFilters = {
  start?: string;
  end?: string;
  userId?: string;
  browser?: string;
  url?: string;
  keyword?: string;
  page?: number;
  size?: number;
  sort?: 'asc' | 'desc';
  cursor?: string | null;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    BaseChartDirective,
    FiltersBarComponent,
    ErrorsTableComponent,
    PagedFooterComponent,
    InfiniteFooterComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  //#region Form & validation
  form = this.fb.group(
    {
      start: [''],
      end: [''],
      userId: [''],
      browser: [''],
      url: [''],
      q: [''], // shown in UI, normalized to "keyword"
      page: [1, { nonNullable: true }],
      size: [50, { validators: [Validators.min(1)], nonNullable: true }],
      sort: ['desc' as 'asc' | 'desc', { nonNullable: true }],
    },
    { validators: this.dateRangeValidator.bind(this) }
  );

  private form$ = this.form.valueChanges.pipe(
    startWith(this.form.getRawValue()),
    map(v => ({ ...v })), // detach reference
    debounceTime(250),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  // Debounced filters as a signal (central source of truth)
  filters = toSignal(this.form$, { initialValue: this.form.getRawValue() });

  /** Signals derived from the form  */
  pageSize = signal<number>(50);
  viewMode = signal<ViewMode>('paged');

  private toISOOrUndef(s?: string) {
    if (!s) return undefined;
    const d = new Date(s);
    return isNaN(+d) ? undefined : d.toISOString();
  }

  /** Normalize: trim/drop empties, q→keyword, dates→ISO, merge extras (e.g. cursor) only if present */
  private normalize(f: any, extra?: Partial<NormalizedFilters>): NormalizedFilters {
    const out: NormalizedFilters = {};
    const put = (k: keyof NormalizedFilters, v: any) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return;
        (out as any)[k] = t;
      } else {
        (out as any)[k] = v;
      }
    };

    put('start', this.toISOOrUndef(f.start));
    put('end', this.toISOOrUndef(f.end));
    put('userId', f.userId);
    put('browser', f.browser);
    put('url', f.url);
    put('keyword', f.q);
    put('page', Number(f.page ?? 1));
    put('size', Number(f.size ?? 50));
    put('sort', f.sort === 'asc' ? 'asc' : 'desc');

    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')) {
          (out as any)[k] = v;
        }
      });
    }

    // reflect size to pager UI
    this.pageSize.set(Number(out.size ?? 50));
    return out as NormalizedFilters;
  }

  maxDateTime() {
    const d = new Date();
    d.setSeconds(0, 0);
    return this.toLocalInputValue(d);
  }
  private dateRangeValidator(group: any) {
    const start = group.get('start')?.value;
    const end = group.get('end')?.value;
    const nowISO = this.maxDateTime();
    const errors: any = {};
    if (start && start > nowISO) errors['startInFuture'] = true;
    if (end && end > nowISO) errors['endInFuture'] = true;
    if (start && end && start > end) errors['startAfterEnd'] = true;
    return Object.keys(errors).length ? errors : null;
  }
  private toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  setPreset(kind: '1h' | '24h' | '7d') {
    const end = new Date();
    const start = new Date(end);
    if (kind === '1h')  start.setHours(end.getHours() - 1);
    if (kind === '24h') start.setDate(end.getDate() - 1);
    if (kind === '7d')  start.setDate(end.getDate() - 7);

    this.form.patchValue({
      start: this.toLocalInputValue(start),
      end:   this.toLocalInputValue(end),
      page:  1,
    });
  }
  reset() {
    this.form.reset({
      start: '', end: '', userId: '', browser: '', url: '', q: '',
      page: 1, size: 50, sort: 'desc',
    });
  }

  toggleViewMode(m: ViewMode) {
    if (this.viewMode() === m) return;
    this.viewMode.set(m);

    if (m === 'infinite') {
      // clear PT state; first fetch trigerovaće se iz "jednog efekta" ispod
      this.ptItems.set([]);
      this.ptCursor.set(null);
      this.ptDone.set(false);
    }
  }
  //#endregion

  //#region State for paged & infinite
  loadingPaged  = signal(false);
  loadingPt     = signal(false);

  private pagedResult = signal<{ items: any[]; total: number; cache?: 'hit'|'miss'; windowCapped?: boolean } | null>(null);

  ptItems  = signal<any[]>([]);
  ptCursor = signal<string | null>(null);
  ptDone   = signal(false);
  ptTotal  = signal<number>(0);

  tableItems = computed(() =>
    this.viewMode() === 'paged' ? (this.pagedResult()?.items ?? []) : this.ptItems()
  );
  total      = computed(() =>
    this.viewMode() === 'paged' ? Number(this.pagedResult()?.total ?? 0) : this.ptTotal()
  );
  cacheFlag    = computed(() => this.viewMode() === 'paged' ? (this.pagedResult()?.cache ?? null) : null);
  windowCapped = computed(() => !!this.pagedResult()?.windowCapped);

  // IMPORTANT: depend on filters() so computed updates (not getRawValue)
  currentPage = computed(() => Number(this.filters().page ?? 1));
  maxPage = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize()))));

  prevPage() {
    if (this.viewMode() !== 'paged') return;
    const p = Math.max(1, this.currentPage() - 1);
    this.form.patchValue({ page: p });
  }
  nextPage() {
    if (this.viewMode() !== 'paged') return;
    const p = Math.min(this.maxPage(), this.currentPage() + 1);
    this.form.patchValue({ page: p });
  }
  goToPage(n: number) {
    if (this.viewMode() !== 'paged') return;
    const page = Math.max(1, Math.min(this.maxPage(), Math.floor(n)));
    this.form.patchValue({ page });
  }
  //#endregion

  //#region One driver effect: chooses endpoint by mode & filters
  private fetchSub?: Subscription;

  constructor() {
    effect((onCleanup) => {
      // 🔑 READ SIGNALS so effect re-runs: both viewMode() and filters()
      const mode = this.viewMode();
      const f    = this.filters();
      const norm = this.normalize(f);

      if (this.fetchSub) this.fetchSub.unsubscribe();

      if (mode === 'paged') {
        this.loadingPaged.set(true);
        this.fetchSub = this.api.getSearch(norm).subscribe({
          next: (res) => this.pagedResult.set(res),
          error: () => this.pagedResult.set({ items: [], total: 0 }),
          complete: () => this.loadingPaged.set(false),
        });
      } else {
        // INFINITE: first page (NO cursor field sent)
        this.ptItems.set([]);
        this.ptCursor.set(null);
        this.ptDone.set(false);
        this.loadingPt.set(true);

        this.fetchSub = this.api.getSearchPt(norm).subscribe({
          next: (res: any) => {
            this.ptItems.set(res.items ?? []);
            this.ptCursor.set(res.cursor ?? null);
            this.ptDone.set(!!res.done || !res.cursor);
            this.ptTotal.set(Number(res.total ?? 0));
          },
          error: () => {
            this.ptItems.set([]);
            this.ptCursor.set(null);
            this.ptDone.set(true);
            this.ptTotal.set(0);
          },
          complete: () => this.loadingPt.set(false),
        });
      }

      onCleanup(() => {
        if (this.fetchSub) this.fetchSub.unsubscribe();
      });
    });

    // Charts data fill
    effect(() => {
      const raw = this.statsView();
      if (!raw) return;
      const { topBrowsers, topErrorMessages } = adaptStats(raw);

      this.browsersChartData.set({
        labels: topBrowsers.map(b => b.key ?? 'unknown'),
        datasets: [{ data: topBrowsers.map(b => b.doc_count) }],
      });
      this.errorMessagesChartData.set({
        labels: topErrorMessages.map(m => String(m.key ?? 'unknown').slice(0, 40)),
        datasets: [{ data: topErrorMessages.map(m => m.doc_count), label: 'Count' }],
      });
    });
  }
  //#endregion

  //#region Infinite: manual “Load more”
  loadFirstPt() {
    if (this.viewMode() !== 'infinite') return;
    if (this.loadingPt()) return;
    // trigger first page explicitly (constructor effect already does on filter change)
    const norm = this.normalize(this.filters());
    this.loadingPt.set(true);
    this.api.getSearchPt(norm).subscribe({
      next: (res: any) => {
        this.ptItems.set(res.items ?? []);
        this.ptCursor.set(res.cursor ?? null);
        this.ptDone.set(!!res.done || !res.cursor);
        this.ptTotal.set(Number(res.total ?? 0));
      },
      error: () => this.ptDone.set(true),
      complete: () => this.loadingPt.set(false),
    });
  }

  loadMorePt() {
    if (this.viewMode() !== 'infinite') return;
    if (this.loadingPt() || this.ptDone()) return;

    const cursor = this.ptCursor();
    if (!cursor) { this.ptDone.set(true); return; } // nothing more to load

    const norm = this.normalize(this.filters(), { cursor });
    this.loadingPt.set(true);

    this.api.getSearchPt(norm).subscribe({
      next: (res: any) => {
        this.ptItems.set([...this.ptItems(), ...(res.items ?? [])]);
        this.ptCursor.set(res.cursor ?? null);
        this.ptDone.set(!!res.done || !res.cursor);
        this.ptTotal.set(Number(res.total ?? this.ptTotal()));
      },
      error: () => this.ptDone.set(true),
      complete: () => this.loadingPt.set(false),
    });
  }
  //#endregion

  //#region Stats (ES / Redis)
  statsSource = signal<StatsSource>('es');
  redisScope  = signal<RedisScope>('global');
  autoRefresh = signal(true); // fixed 10s for Redis

  private esStats$ = toObservable(this.filters).pipe(
    map(f => this.normalize(f)),
    switchMap(norm => this.api.getStats(norm))
  );

  esStats = signal<any>(null);
  private esSub = this.esStats$.subscribe(v => this.esStats.set(v));

  private redisStats$ = combineLatest([
    toObservable(this.statsSource),
    toObservable(this.redisScope),
    toObservable(this.autoRefresh),
  ]).pipe(
    switchMap(([src, scope, auto]) => {
      if (src !== 'redis') return of(null);
      const tick$ = auto ? timer(0, 10_000) : timer(0, Infinity);
      return tick$.pipe(switchMap(() => this.api.getWidgetsTop(scope, 5)));
    })
  );
  redisStats = signal<any>(null);
  private redisSub = this.redisStats$.subscribe(v => this.redisStats.set(v));

  statsView = computed(() => this.statsSource() === 'es' ? this.esStats() : this.redisStats());
  //#endregion

  //#region Charts
  pieOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    layout: { padding: 8 },
  };
  barOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    scales: { x: { beginAtZero: true } },
    plugins: { legend: { display: false } },
    layout: { padding: 8 },
  };

  browsersChartData = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  errorMessagesChartData = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });

  hasBrowserData = computed(() => {
    const d = this.browsersChartData();
    return (d.datasets?.[0]?.data?.length ?? 0) > 0;
  });
  hasErrorData = computed(() => {
    const d = this.errorMessagesChartData();
    return (d.datasets?.[0]?.data?.length ?? 0) > 0;
  });
  //#endregion
}
