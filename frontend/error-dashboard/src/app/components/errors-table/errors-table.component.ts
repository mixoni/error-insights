import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ErrorRow {
  id?: string;
  timestamp: string | number | Date;
  userId?: string;
  browser?: string;
  url?: string;
  errorMessage?: string;
}

@Component({
  selector: 'app-errors-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './errors-table.component.html',
  styleUrls: ['./errors-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorsTableComponent {
  @Input({ required: true }) items: ErrorRow[] = [];
  @Input() loading = false;
  @Input() emptyMessage = 'No data';

  trackByRow(index: number, row: { id?: string }) {
    return row.id ?? index;
  }
}
