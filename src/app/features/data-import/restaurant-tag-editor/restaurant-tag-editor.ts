/**
 * @file 取り込み&タグ付け画面の店舗1件分の行（Places情報表示・再取得・ジャンル/気分タグ編集・削除）。
 * 営業時間の展開/格納はこのコンポーネント内だけで完結するUI状態のためローカル signal で持つ。
 * Places再取得・タグ変更・削除は親（`Data`）に委譲し、実際の `RestaurantStore` 更新は親が行う。
 */
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule, MatSelectChange } from '@angular/material/select';
import { Restaurant } from '@shared/models/restaurant';
import { GENRE_OPTIONS, MOOD_OPTIONS } from '@shared/models/tags';

@Component({
  selector: 'app-restaurant-tag-editor',
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './restaurant-tag-editor.html',
  styleUrl: './restaurant-tag-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestaurantTagEditor {
  readonly restaurant = input.required<Restaurant>();
  /** 地図情報を取得中かどうか（多重クリック防止・スピナー表示用。親の Set 管理を反映）。 */
  readonly enriching = input(false);

  readonly genresChange = output<string[]>();
  readonly moodsChange = output<string[]>();
  readonly removeRequested = output<void>();
  readonly enrichRequested = output<void>();

  /** ジャンル／気分の選択肢（選択式入力用）。 */
  readonly genreOptions = GENRE_OPTIONS;
  readonly moodOptions = MOOD_OPTIONS;

  /** 営業時間（曜日別テキスト）の展開状態。行ごとに独立したUI状態なのでローカルに持つ。 */
  readonly hoursExpanded = signal(false);

  toggleHours(): void {
    this.hoursExpanded.update((v) => !v);
  }

  onGenresChange(event: MatSelectChange): void {
    this.genresChange.emit(event.value);
  }

  onMoodsChange(event: MatSelectChange): void {
    this.moodsChange.emit(event.value);
  }

  /** Places の価格帯（0〜4）を「￥」表示に変換。 */
  priceLevelText(level: number): string {
    return level <= 0 ? '無料' : '￥'.repeat(level);
  }
}
