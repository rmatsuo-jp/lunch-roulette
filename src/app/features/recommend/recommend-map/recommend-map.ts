/**
 * @file 「おすすめ」一覧の地図表示（複数マーカー）を担う提示専用の子コンポーネント。
 * マーカー一覧が変化するたびに `fitBounds()` で表示範囲を自動調整する。
 * Google Maps JS API 自体の読み込み管理は `GoogleMapsLoader`（親コンポーネント側）が担う。
 */
import { ChangeDetectionStrategy, Component, computed, effect, input, output, viewChild } from '@angular/core';
import { GoogleMap, MapMarker } from '@angular/google-maps';
import { Restaurant } from '@shared/models/restaurant';

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

  protected readonly markers = computed(() =>
    this.restaurants().map((r) => ({
      restaurant: r,
      position: { lat: r.places?.lat ?? 0, lng: r.places?.lng ?? 0 } as google.maps.LatLngLiteral,
    })),
  );

  constructor() {
    effect(() => {
      const map = this.map();
      const list = this.markers();
      if (!map || list.length === 0) return;
      const bounds = new google.maps.LatLngBounds();
      for (const m of list) bounds.extend(m.position);
      map.fitBounds(bounds);
    });
  }
}
