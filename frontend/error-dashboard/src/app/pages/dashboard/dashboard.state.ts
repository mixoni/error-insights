import { Injectable, computed, effect, signal } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import {
  combineLatest, debounceTime, distinctUntilChanged, map,
  startWith, switchMap, timer, of, Subscription
} from 'rxjs';
import { FormGroup } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { normalizeFilters, NormalizedFilters } from '../../utils/filters.util';
import { adaptStats } from '../../utils/utils.service';

type ViewMode    = 'paged'|'infinite';
type StatsSource = 'es'|'redis';
type RedisScope  = '1h'|'global';

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  viewMode = signal<ViewMode>('paged');

  // ---- paged state
  loadingPaged = signal(false);
  pagedResult  = signal<{ items:any[]; total:number; cache?:'hit'|'miss'; windowCapped?:boolean }|null>(null);

  // ---- infinite state (PIT)
  loadingPt = signal(false);
  ptItems   = signal<any[]>([]);
  ptCursor  = signal<string|null>(null);
  ptDone    = signal(false);
  ptTotal   = signal<number>(0);

  // ---- stats source/scope
  statsSource = signal<StatsSource>('es');
  redisScope  = signal<RedisScope>('global');
  autoRefresh = signal(true); // fixed 10s za Redis

  // ---- raw stats data
  private esStatsRaw    = signal<any>(null);
  private redisStatsRaw = signal<any>(null);

  // ---- unified stats view 
  statsView = computed(() =>
    this.statsSource() === 'es' ? this.esStatsRaw() : this.redisStatsRaw()
  );

  // ---- chart data 
  browsersChartData = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });
  errorMessagesChartData = signal<{ labels: string[]; datasets: any[] }>({ labels: [], datasets: [] });

  private fetchSub?: Subscription;
  private esSub?: Subscription;
  private redisSub?: Subscription;

  constructor(private api: ApiService) {}

  bind(form: FormGroup) {
    const form$ = form.valueChanges.pipe(
      startWith(form.getRawValue()),
      map(v => ({ ...v })), debounceTime(250),
      distinctUntilChanged((a,b)=>JSON.stringify(a)===JSON.stringify(b))
    );
    const filters = toSignal(form$, { initialValue: form.getRawValue() });

    const pageSize = computed(() => Number(filters().size ?? 50));
    const tableItems = computed(() =>
      this.viewMode()==='paged' ? (this.pagedResult()?.items ?? []) : this.ptItems()
    );
    const total = computed(() =>
      this.viewMode()==='paged' ? Number(this.pagedResult()?.total ?? 0) : this.ptTotal()
    );
    const cacheFlag    = computed(() => this.viewMode()==='paged' ? (this.pagedResult()?.cache ?? null) : null);
    const windowCapped = computed(() => !!this.pagedResult()?.windowCapped);

    effect((onCleanup) => {
      const mode = this.viewMode();
      const f    = filters();
      const norm = normalizeFilters(f);

      if (this.fetchSub) this.fetchSub.unsubscribe();

      if (mode === 'paged') {
        this.loadingPaged.set(true);
        this.fetchSub = this.api.getSearch(norm).subscribe({
          next: res => this.pagedResult.set(res),
          error: () => this.pagedResult.set({ items: [], total: 0 }),
          complete: () => this.loadingPaged.set(false),
        });
      } else {
        this.ptItems.set([]); this.ptCursor.set(null); this.ptDone.set(false);
        this.loadingPt.set(true);

        this.fetchSub = this.api.getSearchPt(norm).subscribe({
          next: (res:any) => {
            this.ptItems.set(res.items ?? []);
            this.ptCursor.set(res.cursor ?? null);
            this.ptDone.set(!!res.done || !res.cursor);
            this.ptTotal.set(Number(res.total ?? 0));
          },
          error: () => { this.ptItems.set([]); this.ptCursor.set(null); this.ptDone.set(true); this.ptTotal.set(0); },
          complete: () => this.loadingPt.set(false),
        });
      }

      onCleanup(()=> this.fetchSub?.unsubscribe());
    });


    this.esSub?.unsubscribe();
    this.esSub = combineLatest([
      toObservable(this.statsSource),
      toObservable(filters),
    ]).pipe(
      switchMap(([src, f]) => {
        if (src !== 'es') return of(null);
        return this.api.getStats(normalizeFilters(f));
      })
    ).subscribe(raw => {
      this.esStatsRaw.set(raw);
    });

    // ---- Redis stats (auto 10s)
    this.redisSub?.unsubscribe();
    this.redisSub = combineLatest([
      toObservable(this.statsSource),
      toObservable(this.redisScope),
      toObservable(this.autoRefresh),
    ]).pipe(
      switchMap(([src, scope, auto]) => {
        if (src !== 'redis') return of(null);
        const tick$ = auto ? timer(0, 10_000) : timer(0, Infinity);
        return tick$.pipe(switchMap(() => this.api.getWidgetsTop(scope, 5)));
      })
    ).subscribe(raw => {
      this.redisStatsRaw.set(raw);
    });

    effect(() => {
      const raw = this.statsView();
      if (!raw) {
        this.browsersChartData.set({ labels: [], datasets: [] });
        this.errorMessagesChartData.set({ labels: [], datasets: [] });
        return;
      }
      const { topBrowsers, topErrorMessages } = adaptStats(raw);
      this.browsersChartData.set({
        labels: topBrowsers.map(b => b.key ?? 'unknown'),
        datasets: [{ data: topBrowsers.map(b => b.doc_count) }],
      });
      this.errorMessagesChartData.set({
        labels: topErrorMessages.map(m => String(m.key ?? 'unknown').slice(0,40)),
        datasets: [{ data: topErrorMessages.map(m => m.doc_count), label: 'Count' }],
      });
    });

    return {
      filters,
      pageSize,
      tableItems,
      total,
      cacheFlag,
      windowCapped,

      statsSource: this.statsSource,
      redisScope : this.redisScope,
      autoRefresh: this.autoRefresh,
      statsView  : this.statsView,

      browsersChartData: this.browsersChartData,
      errorMessagesChartData: this.errorMessagesChartData,
    };
  }

  // ---- actions
  toggleViewMode(m: ViewMode) {
    if (this.viewMode() === m) return;
    this.viewMode.set(m);
  }

  loadMore(filters: any) {
    if (this.viewMode() !== 'infinite') return;
    if (this.loadingPt() || this.ptDone()) return;
    const cursor = this.ptCursor();
    if (!cursor) { this.ptDone.set(true); return; }

    const norm: NormalizedFilters = normalizeFilters(filters, { cursor });
    this.loadingPt.set(true);
    this.api.getSearchPt(norm).subscribe({
      next: (res:any) => {
        this.ptItems.set([...this.ptItems(), ...(res.items ?? [])]);
        this.ptCursor.set(res.cursor ?? null);
        this.ptDone.set(!!res.done || !res.cursor);
        this.ptTotal.set(Number(res.total ?? this.ptTotal()));
      },
      error: () => this.ptDone.set(true),
      complete: () => this.loadingPt.set(false),
    });
  }
}
