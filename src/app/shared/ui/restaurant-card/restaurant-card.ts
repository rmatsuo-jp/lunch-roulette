/**
 * @file 一覧グリッド用の店舗カード（読み取り専用の提示コンポーネント）。
 * 「おすすめ」画面の「該当するお店」一覧で使用する。タグ編集等の操作は持たない。
 */
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Restaurant } from '@shared/models/restaurant';

@Component({
  selector: 'app-restaurant-card',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './restaurant-card.html',
  styleUrl: './restaurant-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestaurantCard {
  readonly restaurant = input.required<Restaurant>();
}
