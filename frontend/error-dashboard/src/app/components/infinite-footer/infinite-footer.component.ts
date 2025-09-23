import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-infinite-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './infinite-footer.component.html',
  styleUrls: ['./infinite-footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfiniteFooterComponent {
  @Input({ required: true }) hasItems = false;
  @Input() loading = false;
  @Input() done = false;
  @Input({ required: true }) size = 50;

  @Output() loadMore = new EventEmitter<void>();
  @Output() sizeChange = new EventEmitter<number>();

  emitSize(v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) this.sizeChange.emit(n);
  }
}
