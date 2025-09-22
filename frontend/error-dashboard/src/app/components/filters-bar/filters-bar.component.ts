import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-filters-bar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './filters-bar.component.html',
  styleUrls: ['./filters-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltersBarComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() maxDateTime = ''; // ISO string for [max] attributes
  @Output() preset = new EventEmitter<'1h'|'24h'|'7d'>();
  @Output() reset = new EventEmitter<void>();
}
