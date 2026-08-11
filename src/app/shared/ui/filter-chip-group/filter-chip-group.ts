/**
 * @file 複数選択可能なチップ群（エリア/ジャンル/気分の絞り込みUI）の汎用コンポーネント。
 * 「おすすめ」画面で3回繰り返されていた同一構造の `mat-chip-set` をまとめる。
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-filter-chip-group',
  imports: [MatChipsModule],
  templateUrl: './filter-chip-group.html',
  styleUrl: './filter-chip-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterChipGroup {
  /** 見出し（例: 「エリア」）。 */
  readonly label = input.required<string>();
  /** 選択肢一覧。 */
  readonly options = input.required<readonly string[]>();
  /** 現在選択中の値。 */
  readonly selected = input.required<readonly string[]>();
  /** 選択肢が0件の場合に表示する案内文。 */
  readonly emptyMessage = input('');
  /** チップクリック時に選択/解除したい値を通知する。 */
  readonly toggle = output<string>();

  isSelected(value: string): boolean {
    return this.selected().includes(value);
  }
}
