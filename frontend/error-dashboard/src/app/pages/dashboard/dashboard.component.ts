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
  debounceTime,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  timer,
  combineLatest,
  filter as rxFilter,
  tap,
  of,
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

// --- Tip koji backend očekuje (kao i do sada) ---
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
      q: [''], // -> keyword
      page: [1, { nonNullable: true }],
      size: [50, { validators: [Validators.min(1)], nonNullable: true }],
      sort: ['desc' as 'asc' | 'desc', { nonNullable: true }],
    },
    { validators: this.dateRangeValidator.bind(this) }
  );

  private formValue$ = this.form.valueChanges.pipe(
    startWith(this.form.getRawValue()),
    map(v => ({ ...v })), // detach ref
    debounceTime(250),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );

  /** Debounce-ovane vrednosti forme kao signal */
  filters = toSignal(this.formValue$, { initialValue: this.form.getRawValue() });

  /** max za datetime-local (sprečava budućnost) */
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

  /** datetime-local → 'YYYY-MM-DDTHH:mm' */
  private toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  }

  /** NORMALIZACIJA: trim, prazne na undefined, q→keyword, datumi→ISO */
  private normalize(f: any, extra?: Partial<NormalizedFilters>): NormalizedFilters {
    const norm: NormalizedFilters = {};
    const set = (k: keyof NormalizedFilters, v: any) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return;
        (norm as any)[k] = t;
      } else {
        (norm as any)[k] = v;
      }
    };

    const toISO = (s?: string) => (s ? new Date(s).toISOString() : undefined);

    set('start', toISO(f.start));
    set('end', toISO(f.end));
    set('userId', f.userId);
    set('browser', f.browser);
    set('url', f.url);
    set('keyword', f.q); // map q → keyword
    set('page', Number(f.page ?? 1));
    set('size', Number(f.size ?? 50));
    set('sort', f.sort === 'asc' ? 'asc' : 'desc');

    // dopune kao cursor itd.
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => set(k as any, v));
    }
    return norm;
  }

  setPreset(kind: '1h' | '24h' | '7d') {
    const end = new Date();
    const start = new Date(end);
    if (kind === '1h') start.setHours(end.getHours() - 1);
    if (kind === '24h') start.setDate(end.getDate() - 1);
    if (kind === '7d') start.setDate(end.getDate() - 7);

    this.form.patchValue({
      start: this.toLocalInputValue(start),
      end: this.toLocalInputValue(end),
      page: 1,
    });
  }

  reset() {
    this.form.reset({
      start: '',
      end: '',
      userId: '',
      browser: '',
      url: '',
      q: '',
      page: 1,
      size: 50,
      sort: 'desc',
    });
  }
  //#endregion

  //#region View mode (paged / infinite)
  viewMode = signal<ViewMode>('paged');
  toggleViewMode(m: ViewMode) {
    if (this.viewMode() === m) return;
    this.viewMode.set(m);

    // reset PT state
    if (m === 'infinite') {
      this.ptItems.set([]);
      this.ptCursor.set(null);
      this.ptDone.set(false);
      // automatski fetch
      this.loadFirstPt();
    }
  }
  //#endregion

  //#region Paged search (ES + Redis cache)
  loading = signal(false);

  private search$ = combineLatest([
    toObservable(this.filters),
    toObservable(this.viewMode),
  ]).pipe(
    rxFilter(([, mode]) => mode === 'paged'),
    map(([f]) => this.normalize(f)), // <-- normalizacija (datumi/keyword/trim)
    switchMap((norm) => {
      this.loading.set(true);
      return this.api.getSearch(norm);
    }),
    tap(() => this.loading.set(false))
  );

  search = toSignal(this.search$, { initialValue: null as any });

  events = computed(() => this.search()?.items ?? []);
  total = computed(() => Number(this.search()?.total ?? 0));
  cacheFlag = computed(() => (this.search() ? this.search().cache : null));
  windowCapped = computed<boolean>(() => !!this.search()?.windowCapped);

  currentPage = computed(() => Number(this.filters().page ?? 1));
  pageSize = computed(() => Number(this.filters().size ?? 50));
  maxPage = computed(() =>
    Math.max(1, Math.ceil(this.total() / Math.max(1, this.pageSize())))
  );

  prevPage() {
    const p = Math.max(1, this.currentPage() - 1);
    this.form.patchValue({ page: p });
  }
  nextPage() {
    const maxP = this.maxPage();
    const p = Math.min(maxP, this.currentPage() + 1);
    this.form.patchValue({ page: p });
  }
  //#endregion

  //#region Infinite (PIT + search_after)
  ptItems = signal<any[]>([]);
  ptCursor = signal<string | null>(null);
  ptLoading = signal(false);
  ptDone = signal(false);

  private runPtFetch(cursor: string | null) {
    if (this.ptLoading()) return;
    this.ptLoading.set(true);

    const f = this.normalize(this.filters(), { cursor });
    this.api.getSearchPt(f).subscribe({
      next: (res: any) => {
        if (cursor) {
          this.ptItems.set([...this.ptItems(), ...(res.items ?? [])]);
        } else {
          this.ptItems.set(res.items ?? []);
        }
        this.ptCursor.set(res.cursor ?? null);
        this.ptDone.set(!!res.done || !res.cursor);
      },
      error: () => this.ptDone.set(true),
      complete: () => this.ptLoading.set(false),
    });
  }

  loadFirstPt() { this.runPtFetch(null); }
  loadMorePt()  { if (!this.ptDone()) this.runPtFetch(this.ptCursor()); }
  //#endregion

  //#region Stats (ES or Redis)
  statsSource = signal<StatsSource>('es');
  redisScope = signal<RedisScope>('global');
  autoRefresh = signal(true); // zaključano na 10s za Redis

  // ES stats (po filterima)
  private esStats$ = toObservable(this.filters).pipe(
    map(f => this.normalize(f)), // datumi/keyword kao i search
    switchMap((norm) => this.api.getStats(norm))
  );
  esStats = toSignal(this.esStats$, { initialValue: null as any });

  // Redis widgets (scope + auto refresh 10s)
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
  redisStats = toSignal(this.redisStats$, { initialValue: null as any });

  /** unified source for charts */
  statsView = computed(() =>
    this.statsSource() === 'es' ? this.esStats() : this.redisStats()
  );
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

  
  constructor() {
    // kad se filteri menjaju u infinite modu → reset & auto load
    effect(() => {
      const _ = this.filters();
      if (this.viewMode() === 'infinite') {
        this.ptItems.set([]);
        this.ptCursor.set(null);
        this.ptDone.set(false);
      }
    });

    // punjenje chart podataka
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
}
