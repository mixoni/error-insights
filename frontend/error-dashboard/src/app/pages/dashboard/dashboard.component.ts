import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { BaseChartDirective } from 'ng2-charts';

import { FiltersBarComponent } from '../../components/filters-bar/filters-bar.component';
import { ErrorsTableComponent } from '../../components/errors-table/errors-table.component';
import { PagedFooterComponent } from '../../components/paged-footer/paged-footer.component';
import { InfiniteFooterComponent } from '../../components/infinite-footer/infinite-footer.component';

import { DashboardStateService } from './dashboard.state';
import { dateRangeValidatorFn, normalizeFilters } from '../../utils/filters.util';

type ViewMode = 'paged' | 'infinite';
type StatsSource = 'es' | 'redis';
type RedisScope = '1h' | 'global';

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
  readonly state = inject(DashboardStateService);

  form = this.fb.group(
    {
      start: [''],
      end: [''],
      userId: [''],
      browser: [''],
      url: [''],
      q: [''],
      page: [1, { nonNullable: true }],
      size: [50, { validators: [Validators.min(1)], nonNullable: true }],
      sort: ['desc' as 'asc' | 'desc', { nonNullable: true }],
    },
    {
      validators: (group: any) => dateRangeValidatorFn(this.maxDateTime())(group),
    }
  );

  viewMode = this.state.viewMode; 

  filtersSig!: Signal<any>;
  pageSize!: Signal<number>;
  tableItems!: Signal<any[]>;
  total!: Signal<number>;
  cacheFlag!: Signal<'hit' | 'miss' | null>;
  windowCapped!: Signal<boolean>

  constructor() {
    const bound = this.state.bind(this.form);
    this.filtersSig   = bound.filters;
    this.pageSize     = bound.pageSize;
    this.tableItems   = bound.tableItems;
    this.total        = bound.total;
    this.cacheFlag    = bound.cacheFlag;
    this.windowCapped = bound.windowCapped;
  }

  maxDateTime() {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  setPreset(kind: '1h' | '24h' | '7d') {
    const end = new Date();
    const start = new Date(end);
    if (kind === '1h')  start.setHours(end.getHours() - 1);
    if (kind === '24h') start.setDate(end.getDate() - 1);
    if (kind === '7d')  start.setDate(end.getDate() - 7);
    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    this.form.patchValue({ start: toLocal(start), end: toLocal(end), page: 1 });
  }

  reset() {
    this.form.reset({
      start: '', end: '',
      userId: '', browser: '', url: '', q: '',
      page: 1, size: 50, sort: 'desc',
    });
  }

  toggleViewMode(m: ViewMode) {
    this.state.toggleViewMode(m);
  }

  // --- Paged pager
  currentPage = computed(() => Number(this.filtersSig().page ?? 1));
  maxPage     = computed(() => Math.max(1, Math.ceil((this.total() || 0) / Math.max(1, this.pageSize()))));

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

  // --- Infinite (Load first / Load more)
  loadFirstPt() {
    this.form.patchValue({ size: this.form.value.size }); // no-op patch koji trigeruje valueChanges
  }
  loadMorePt() {
    this.state.loadMore(this.form.getRawValue());
  }

  // ---- Charts 
  browsersChartData = this.state.browsersChartData;
  errorMessagesChartData = this.state.errorMessagesChartData;

  hasBrowserData = computed(() => (this.browsersChartData().datasets?.[0]?.data?.length ?? 0) > 0);
  hasErrorData   = computed(() => (this.errorMessagesChartData().datasets?.[0]?.data?.length ?? 0) > 0);

  showStatsSection = computed(() => this.hasBrowserData() || this.hasErrorData());

  // ---- Stats toggles
  statsSource = this.state.statsSource; 
  redisScope  = this.state.redisScope; 
  autoRefresh = this.state.autoRefresh; 


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
}
