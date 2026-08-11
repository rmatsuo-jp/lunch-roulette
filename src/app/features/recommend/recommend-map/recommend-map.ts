/**
 * @file 「おすすめ」一覧の地図表示（複数マーカー）を担う提示専用の子コンポーネント。
 * マーカー一覧が変化するたびに `fitBounds()` で表示範囲を自動調整する。
 * Google Maps JS API 自体の読み込み管理は `GoogleMapsLoader`（親コンポーネント側）が担う。
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { Restaurant } from '@shared/models/restaurant';
import { locationOf } from '@services/places-utils';

@Component({
  selector: 'app-recommend-map',
  imports: [GoogleMap, MapMarker],
  templateUrl: './recommend-map.html',
  styleUrl: './recommend-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecommendMap {
  readonly restaurants = input.required<Restaurant[]>();
  readonly center = input.required<google.maps.LatLngLiteral>();
  readonly markerClick = output<Restaurant>();

  private readonly map = viewChild(GoogleMap);

  // 座標を持たない・Places 取得に失敗した店は除外する。0 で埋めると (0,0) にマーカーが立ち、
  // fitBounds がそれを含めて地図全体をズームアウトさせてしまうため。
  protected readonly markers = computed(() =>
    this.restaurants().flatMap((r) => {
      const position = locationOf(r);
      return position ? [{ restaurant: r, position }] : [];
    }),
  );

  constructor() {
    effect(() => {
      const map = this.map();
      const list = this.markers();
      // API 未初期化のまま実行されると例外でビュー全体の描画が止まるため二重に防御する。
      if (!map || list.length === 0 || !window.google?.maps?.LatLngBounds) return;
      const bounds = new google.maps.LatLngBounds();
      for (const m of list) bounds.extend(m.position);
      map.fitBounds(bounds);
    });
  }
}
