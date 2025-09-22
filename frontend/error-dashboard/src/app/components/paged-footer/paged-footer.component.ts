import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-paged-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paged-footer.component.html',
  styleUrls: ['./paged-footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PagedFooterComponent {
  @Input({ required: true }) page = 1;
  @Input({ required: true }) size = 50;
  @Input({ required: true }) maxPage = 1;
  @Input() windowCapped = false;

  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() sizeChange = new EventEmitter<number>();
  @Output() goto = new EventEmitter<number>();

  gotoInput: string = '';

  emitSize(v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) this.sizeChange.emit(n);
  }
  emitGoto() {
    const n = Number(this.gotoInput);
    if (Number.isFinite(n) && n >= 1) this.goto.emit(n);
  }
}
